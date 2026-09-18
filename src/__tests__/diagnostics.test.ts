import { configurationGroups, worstStatus, type DiagnosticGroup } from '@/lib/diagnostics'

/**
 * The admin diagnostics screen exists so a configuration fault reads as a
 * configuration fault, instead of surfacing as "could not start payment"
 * to a donor and a stack trace in a log nobody opens.
 */

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
})

function check(groups: DiagnosticGroup[], id: string) {
  return groups.flatMap((g) => g.checks).find((c) => c.id === id)
}

describe('configurationGroups', () => {
  it('reports an unset Stripe key as broken, naming the variable', () => {
    delete process.env.STRIPE_SECRET_KEY
    const found = check(configurationGroups(), 'stripe-key')
    expect(found?.status).toBe('fail')
    expect(found?.variables).toContain('STRIPE_SECRET_KEY')
  })

  it('says plainly when the key is a test one', () => {
    // Checkout opens and test cards work, so nothing looks wrong until
    // someone wonders where the money went.
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'
    const found = check(configurationGroups(), 'stripe-key')
    expect(found?.status).toBe('ok')
    expect(found?.detail).toMatch(/TEST key/)
    // The guarantee, however it is worded: no real card goes through.
    expect(found?.detail).toMatch(/real card is declined/i)
  })

  it('still reports test mode when the key was pasted with whitespace', () => {
    // getStripe() trims, so such a key authenticates and every charge goes
    // to the test ledger. Reporting it as live would be wrong in the
    // direction that loses money quietly.
    process.env.STRIPE_SECRET_KEY = '  sk_test_51abcdef\n'
    const found = check(configurationGroups(), 'stripe-key')
    expect(found?.detail).toMatch(/TEST key/)
  })

  it('says where the live switch happens, since the app cannot make it', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'
    const detail = check(configurationGroups(), 'stripe-key')?.detail ?? ''
    expect(detail).toMatch(/STRIPE_SECRET_KEY/)
    // The two steps people miss: the redeploy, and that Price ids are
    // mode-specific and have to be replaced at the same time.
    expect(detail).toMatch(/REDEPLOY/)
    expect(detail).toMatch(/STRIPE_PRICE_/)
  })

  it('does not run two sentences together when a message lacks a full stop', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_51abcdef'
    delete process.env.STRIPE_PRICE_ANNUAL
    const found = check(configurationGroups(), 'price-STRIPE_PRICE_ANNUAL')
    expect(found?.detail).toMatch(/is not set\. Donations are unaffected/)
  })

  it('keeps a broken public address in the list — it breaks reset links, not payments', () => {
    process.env.NEXTAUTH_URL = 'drrisq1fechq='
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
    const found = check(configurationGroups(), 'app-url')
    // Outside production this falls back to localhost, which is correct
    // for a developer and still worth showing, so the assertion is on
    // the variable being named rather than the status.
    expect(found?.variables).toContain('NEXTAUTH_URL')
  })

  it('groups every check under a heading', () => {
    const groups = configurationGroups()
    expect(groups.map((g) => g.id)).toEqual(['payments', 'site', 'notifications'])
    for (const group of groups) {
      expect(group.checks.length).toBeGreaterThan(0)
    }
  })
})

describe('worstStatus', () => {
  const group = (...statuses: Array<'ok' | 'warn' | 'fail'>): DiagnosticGroup[] => [
    { id: 'g', label: 'G', checks: statuses.map((status, i) => ({ id: `c${i}`, label: 'c', status, detail: '' })) },
  ]

  it('is ok only when everything is', () => {
    expect(worstStatus(group('ok', 'ok'))).toBe('ok')
  })

  it('lets one failure speak for the page', () => {
    expect(worstStatus(group('ok', 'warn', 'fail'))).toBe('fail')
  })

  it('does not let a warning hide behind a pass', () => {
    expect(worstStatus(group('ok', 'warn'))).toBe('warn')
  })
})

/**
 * The price ids are the thing that silently breaks on the way from test to
 * live: both modes issue real-looking `price_…` ids and neither says which
 * it came from, so the first symptom is "No such price" on a customer's
 * upgrade. Only Stripe can answer it, which makes *how the answer failed*
 * worth separating.
 */
describe('stripePricesCheck', () => {
  const retrieve = jest.fn()

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly'
    process.env.STRIPE_PRICE_ANNUAL = 'price_annual'
    process.env.STRIPE_PRICE_LIFETIME = 'price_lifetime'
  })

  /** Re-imports the module with getStripe() stubbed, since it holds no client. */
  async function load() {
    jest.doMock('@/lib/stripe', () => ({
      ...jest.requireActual('@/lib/stripe'),
      getStripe: () => ({ prices: { retrieve } }),
    }))
    return import('@/lib/diagnostics')
  }

  it('passes when every configured price exists', async () => {
    retrieve.mockResolvedValue({ id: 'price_monthly' })
    const { stripePricesCheck } = await load()
    const result = await stripePricesCheck()
    expect(result?.status).toBe('ok')
    expect(retrieve).toHaveBeenCalledTimes(3)
  })

  it('names the variables whose price is missing, and blames the mode', async () => {
    retrieve.mockImplementation((id: string) =>
      id === 'price_annual'
        ? Promise.reject(Object.assign(new Error('No such price'), { code: 'resource_missing' }))
        : Promise.resolve({ id })
    )
    const { stripePricesCheck } = await load()
    const result = await stripePricesCheck()
    expect(result?.status).toBe('fail')
    expect(result?.variables).toEqual(['STRIPE_PRICE_ANNUAL'])
    expect(result?.detail).toMatch(/test mode/)
  })

  // Reporting an unreachable Stripe as "no such price" would send the
  // operator to rebuild prices that were never the problem.
  it('does not call an unreachable Stripe a missing price', async () => {
    retrieve.mockRejectedValue(
      Object.assign(new Error('Invalid JSON received from the Stripe API'), {
        type: 'StripeAPIError',
      })
    )
    const { stripePricesCheck } = await load()
    const result = await stripePricesCheck()
    expect(result?.status).toBe('warn')
    expect(result?.detail).toMatch(/problem reaching Stripe/i)
    expect(result?.detail).not.toMatch(/no such price in/i)
  })

  it('stays quiet when there is nothing configured to check', async () => {
    delete process.env.STRIPE_PRICE_MONTHLY
    delete process.env.STRIPE_PRICE_ANNUAL
    delete process.env.STRIPE_PRICE_LIFETIME
    const { stripePricesCheck } = await load()
    // The shape checks already report an unset price; a second row saying
    // the same thing reads as a second problem.
    expect(await stripePricesCheck()).toBeNull()
  })
})

/**
 * The webhook is the only writer of "this was paid". A signing secret from
 * the wrong mode passes every check that looks at configuration alone, and
 * then rejects every event — so the card is charged and nothing is
 * recorded. Listing the endpoints is the only way to see it coming.
 */
describe('stripeWebhookCheck', () => {
  const list = jest.fn()

  const endpoint = (over: Record<string, unknown> = {}) => ({
    url: 'http://localhost:3000/api/webhooks/stripe',
    status: 'enabled',
    enabled_events: [
      'checkout.session.completed',
      'invoice.payment_failed',
      'invoice.payment_succeeded',
      'customer.subscription.deleted',
    ],
    ...over,
  })

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  async function load() {
    jest.doMock('@/lib/stripe', () => ({
      ...jest.requireActual('@/lib/stripe'),
      getStripe: () => ({ webhookEndpoints: { list } }),
    }))
    return import('@/lib/diagnostics')
  }

  it('passes when an enabled endpoint here carries every event', async () => {
    list.mockResolvedValue({ data: [endpoint()] })
    const { stripeWebhookCheck } = await load()
    expect((await stripeWebhookCheck())?.status).toBe('ok')
  })

  it('accepts a wildcard subscription', async () => {
    list.mockResolvedValue({ data: [endpoint({ enabled_events: ['*'] })] })
    const { stripeWebhookCheck } = await load()
    expect((await stripeWebhookCheck())?.status).toBe('ok')
  })

  it('fails when no endpoint in this mode points here, and says what it costs', async () => {
    list.mockResolvedValue({ data: [endpoint({ url: 'https://elsewhere.example/hook' })] })
    const { stripeWebhookCheck } = await load()
    const result = await stripeWebhookCheck()
    expect(result?.status).toBe('fail')
    expect(result?.detail).toMatch(/per-mode/)
    // The point a set-but-wrong secret hides: money moves anyway.
    expect(result?.detail).toMatch(/charged/)
  })

  it('fails a disabled endpoint', async () => {
    list.mockResolvedValue({ data: [endpoint({ status: 'disabled' })] })
    const { stripeWebhookCheck } = await load()
    expect((await stripeWebhookCheck())?.status).toBe('fail')
  })

  it('singles out a missing checkout.session.completed as the settling event', async () => {
    list.mockResolvedValue({ data: [endpoint({ enabled_events: ['invoice.payment_failed'] })] })
    const { stripeWebhookCheck } = await load()
    const result = await stripeWebhookCheck()
    expect(result?.status).toBe('fail')
    expect(result?.detail).toMatch(/checkout\.session\.completed is the one that settles/)
  })

  it('does not blame the webhook when Stripe could not be asked', async () => {
    list.mockRejectedValue(Object.assign(new Error('nope'), { type: 'StripeAPIError' }))
    const { stripeWebhookCheck } = await load()
    const result = await stripeWebhookCheck()
    expect(result?.status).toBe('warn')
    expect(result?.detail).toMatch(/not evidence that/i)
  })

  it('stays quiet when no secret is configured — the shape check says that', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { stripeWebhookCheck } = await load()
    expect(await stripeWebhookCheck()).toBeNull()
  })
})
