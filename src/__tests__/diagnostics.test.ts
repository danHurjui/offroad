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
    expect(found?.detail).toMatch(/no real money/i)
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
