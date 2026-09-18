jest.mock('@/lib/prisma', () => ({ prisma: { user: { update: jest.fn() } } }))

import {
  describeStripeFailure,
  stripeConfigProblems,
  StripeConfigError,
} from '@/lib/stripe'
import { isMissingCustomerError } from '@/lib/stripeCustomer'

/**
 * The failures these cover all used to arrive as one sentence — "Could
 * not start checkout" — with a stack trace in a log nobody was reading.
 * The point of each assertion is that the cause is now named and
 * attributed to whoever can fix it.
 */

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
})

/** A Stripe SDK error, as much of one as the code reads. */
function stripeError(fields: Record<string, unknown>) {
  return Object.assign(new Error(String(fields.message ?? 'boom')), fields)
}

describe('describeStripeFailure separates our fault from Stripe\'s', () => {
  it('reports a configuration fault as config, carrying the variable', () => {
    const failure = describeStripeFailure(
      new StripeConfigError('STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY is not set')
    )
    expect(failure.kind).toBe('config')
    expect(failure.variable).toBe('STRIPE_SECRET_KEY')
    expect(failure.advice).toMatch(/STRIPE_SECRET_KEY/)
  })

  it('puts everything Stripe said on one log line', () => {
    const failure = describeStripeFailure(
      stripeError({
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
        statusCode: 400,
        requestId: 'req_123',
        param: 'customer',
        message: 'No such customer: cus_dead',
      })
    )
    expect(failure.kind).toBe('stripe')
    // Each of these is a question the operator would otherwise have to
    // dig for: what kind of refusal, which field, and the id to quote at
    // Stripe support.
    expect(failure.summary).toContain('StripeInvalidRequestError')
    expect(failure.summary).toContain('resource_missing')
    expect(failure.summary).toContain('HTTP 400')
    expect(failure.summary).toContain('req_123')
    expect(failure.summary).toContain('param customer')
    expect(failure.summary).toContain('No such customer: cus_dead')
  })

  it('explains resource_missing as a test/live mix-up, which Stripe does not', () => {
    const failure = describeStripeFailure(
      stripeError({ type: 'StripeInvalidRequestError', code: 'resource_missing', message: 'No such price' })
    )
    expect(failure.advice).toMatch(/test and live are separate/i)
  })

  it('names a revoked or foreign key for an authentication failure', () => {
    const failure = describeStripeFailure(
      stripeError({ type: 'StripeAuthenticationError', message: 'Invalid API Key provided' })
    )
    expect(failure.advice).toMatch(/revoked|different account/i)
  })

  it('recognises an account that has not finished activation', () => {
    // The one failure that looks like a working setup until a real card
    // is entered, so it must not read as a generic bad request.
    const failure = describeStripeFailure(
      stripeError({
        type: 'StripeInvalidRequestError',
        message: 'You cannot create a Checkout Session in live mode until you activate your account',
      })
    )
    expect(failure.advice).toMatch(/activat/i)
  })

  it('keeps a non-Stripe throw rather than pretending to explain it', () => {
    const failure = describeStripeFailure(new Error('socket hang up'))
    expect(failure.kind).toBe('unknown')
    expect(failure.summary).toContain('socket hang up')
  })

  // The summary reaches a log and an admin screen. Stripe already masks
  // the middle of a key in its own messages, but nothing should rely on
  // the other end of that promise.
  it('cuts a key down to its prefix wherever one appears', () => {
    const failure = describeStripeFailure(
      stripeError({
        type: 'StripeAuthenticationError',
        message: 'Invalid API Key provided: sk_live_51QrsTuvWxyz0123456789',
      })
    )
    expect(failure.summary).not.toContain('51QrsTuvWxyz0123456789')
    expect(failure.summary).toContain('sk_live_')
  })
})

describe('stripeConfigProblems reports every fault at once', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly'
    process.env.STRIPE_PRICE_ANNUAL = 'price_annual'
    process.env.STRIPE_PRICE_LIFETIME = 'price_lifetime'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc'
  })

  it('finds nothing when everything is set', () => {
    expect(stripeConfigProblems()).toEqual([])
  })

  it('marks a bad secret key as breaking all payments, donations included', () => {
    delete process.env.STRIPE_SECRET_KEY
    const problems = stripeConfigProblems()
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ variable: 'STRIPE_SECRET_KEY', affects: 'payments' })
  })

  it('marks a bad price id as breaking only Pro', () => {
    // Donations build price_data inline, so a missing Price id cannot
    // affect them — saying otherwise would send the operator hunting in
    // the wrong place.
    process.env.STRIPE_PRICE_ANNUAL = 'prod_Abc123'
    const problems = stripeConfigProblems()
    expect(problems).toEqual([
      expect.objectContaining({ variable: 'STRIPE_PRICE_ANNUAL', affects: 'pro' }),
    ])
  })

  it('reports each broken price separately rather than stopping at the first', () => {
    process.env.STRIPE_PRICE_MONTHLY = 'prod_Abc'
    delete process.env.STRIPE_PRICE_LIFETIME
    expect(stripeConfigProblems().map((p) => p.variable)).toEqual([
      'STRIPE_PRICE_MONTHLY',
      'STRIPE_PRICE_LIFETIME',
    ])
  })

  it('calls a missing webhook secret a settlement fault, not a checkout one', () => {
    // Checkout still opens and the card is still charged; what breaks is
    // that nothing is ever recorded as paid. Calling that "payments are
    // broken" would be wrong in a way that costs money quietly.
    delete process.env.STRIPE_WEBHOOK_SECRET
    const problems = stripeConfigProblems()
    expect(problems).toEqual([
      expect.objectContaining({ variable: 'STRIPE_WEBHOOK_SECRET', affects: 'settlement' }),
    ])
    expect(problems[0].message).toMatch(/charged/i)
  })
})

describe('isMissingCustomerError tells a dead customer from a dead price', () => {
  it('accepts the customer param', () => {
    expect(
      isMissingCustomerError({ code: 'resource_missing', param: 'customer' }, 'cus_1')
    ).toBe(true)
  })

  it('accepts a message naming the customer id', () => {
    expect(
      isMissingCustomerError(
        { code: 'resource_missing', message: 'No such customer: cus_1' },
        'cus_1'
      )
    ).toBe(true)
  })

  // The Pro checkout passes a customer and a price in the same call, so
  // getting this wrong would discard a good customer id every time a
  // price id was mistyped.
  it('refuses a missing price', () => {
    expect(
      isMissingCustomerError(
        { code: 'resource_missing', param: 'line_items[0][price]', message: 'No such price: price_x' },
        'cus_1'
      )
    ).toBe(false)
  })

  it('refuses any other error', () => {
    expect(isMissingCustomerError({ code: 'card_declined', param: 'customer' }, 'cus_1')).toBe(false)
    expect(isMissingCustomerError(new Error('socket hang up'), 'cus_1')).toBe(false)
    expect(isMissingCustomerError(null, 'cus_1')).toBe(false)
  })
})
