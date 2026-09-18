import Stripe from 'stripe'

/**
 * RL-017: single Stripe client + plan config. Three purchase options per
 * the ticket — Monthly/Annual are recurring Prices, Lifetime is a
 * one-time Price. Price IDs are configured in the Stripe dashboard (RON
 * currency) and referenced here by env var rather than hardcoded, since
 * they differ between test and live mode.
 */
/**
 * A fault in *this deployment's* configuration, as opposed to anything
 * Stripe did.
 *
 * The distinction is the whole point. Both arrive at the same `catch` and
 * used to produce the same "Could not start checkout" for the person
 * paying, but they have different owners and different fixes: this one is
 * an environment variable the operator can correct, and until they do,
 * retrying is pointless — so the route answers differently for it (see
 * `paymentsUnavailable` in the checkout routes) rather than inviting a
 * donor to try their card again.
 *
 * It carries the variable at fault because "No such price" does not say
 * which of the three price variables held the wrong value.
 */
export class StripeConfigError extends Error {
  readonly variable: string

  constructor(variable: string, message: string) {
    super(message)
    this.name = 'StripeConfigError'
    this.variable = variable
  }
}

/**
 * Why these check the *shape* of what is configured.
 *
 * Every one of these mistakes produces the same thing for the person
 * trying to pay — "Could not start checkout" — and, in the log, whatever
 * Stripe chose to say. "No such price: prod_Abc123" does not name which of
 * the three price variables holds it, and "Invalid API Key provided" does
 * not say that what was pasted is a publishable key. The shapes are
 * unambiguous and documented, so a wrong one can be named here, with the
 * variable it came from.
 *
 * These are not security checks — Stripe rejects a bad key regardless.
 * They exist so a deployment problem reads as a deployment problem.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw new StripeConfigError(
      'STRIPE_SECRET_KEY',
      'STRIPE_SECRET_KEY is not set, so no payment can be started. Copy the secret key from the ' +
        'Stripe dashboard under Developers → API keys.'
    )
  }
  if (key.startsWith('pk_')) {
    throw new StripeConfigError(
      'STRIPE_SECRET_KEY',
      'STRIPE_SECRET_KEY holds a publishable key (pk_…). The secret key starts with sk_ and is ' +
        'shown under Developers → API keys → Secret key.'
    )
  }
  if (!key.startsWith('sk_') && !key.startsWith('rk_')) {
    throw new StripeConfigError(
      'STRIPE_SECRET_KEY',
      'STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_… or rk_…)'
    )
  }
  return new Stripe(key)
}

/** Whether the configured secret key is a test-mode one. */
export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_') ||
    (process.env.STRIPE_SECRET_KEY ?? '').startsWith('rk_test_')
}

export type ProPlanId = 'MONTHLY' | 'ANNUAL' | 'LIFETIME'

export const PRO_PLANS: Record<ProPlanId, { label: string; priceRon: number; mode: 'subscription' | 'payment'; envVar: string }> = {
  MONTHLY: { label: 'Monthly', priceRon: 14.99, mode: 'subscription', envVar: 'STRIPE_PRICE_MONTHLY' },
  ANNUAL: { label: 'Annual', priceRon: 99, mode: 'subscription', envVar: 'STRIPE_PRICE_ANNUAL' },
  LIFETIME: { label: 'Lifetime', priceRon: 299, mode: 'payment', envVar: 'STRIPE_PRICE_LIFETIME' },
}

export function isProPlanId(value: unknown): value is ProPlanId {
  return value === 'MONTHLY' || value === 'ANNUAL' || value === 'LIFETIME'
}

export function priceIdFor(plan: ProPlanId): string {
  const { envVar } = PRO_PLANS[plan]
  const priceId = process.env[envVar]?.trim()
  if (!priceId) throw new StripeConfigError(envVar, `${envVar} is not set`)

  // The usual slip is pasting the *product* id, or the payment-link URL,
  // from the same dashboard page. Stripe's own answer to that is "No such
  // price", which names the value but not the variable that carried it.
  if (priceId.startsWith('prod_')) {
    throw new StripeConfigError(
      envVar,
      `${envVar} holds a product id (${priceId}). It needs the Price id under that product — ` +
        'Stripe dashboard → Product catalogue → the product → its price, which starts with price_.'
    )
  }
  if (/^https?:\/\//i.test(priceId)) {
    throw new StripeConfigError(
      envVar,
      `${envVar} holds a URL. It needs a Price id (price_…), not a payment link.`
    )
  }
  if (!priceId.startsWith('price_')) {
    throw new StripeConfigError(
      envVar,
      `${envVar} is "${priceId}", which is not a Stripe Price id — they start with price_.`
    )
  }

  // Test and live are separate object spaces: a live price id under a test
  // key (or the reverse) fails with "No such price" even though both
  // values are real and correctly copied. The prefix does not distinguish
  // them, so this cannot be checked here — DEPLOY.md says it instead.
  return priceId
}

/**
 * Stripe puts the key in its own error messages ("Invalid API Key
 * provided: sk_live_51****cdef"). It redacts the middle itself, but these
 * strings end up in a log and on an admin screen, so anything still
 * key-shaped is cut down to its prefix before it travels.
 */
function redactKeys(text: string): string {
  return text.replace(/\b((?:sk|rk|pk)_(?:test|live)_)[A-Za-z0-9*]{4,}/g, '$1…')
}

export type StripeFailureKind = 'config' | 'stripe' | 'unknown'

export interface StripeFailure {
  kind: StripeFailureKind
  /** The environment variable at fault, when the failure names one. */
  variable?: string
  /** One line for the server log — everything Stripe was willing to say. */
  summary: string
  /** What the operator should do about it. Safe to show an admin. */
  advice: string
}

/** Stripe's error objects, as much of them as we read. */
interface StripeErrorLike {
  type?: string
  code?: string
  statusCode?: number
  requestId?: string
  param?: string
  message?: string
}

function isStripeErrorLike(error: unknown): error is StripeErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as StripeErrorLike).type === 'string' &&
    (error as StripeErrorLike).type!.startsWith('Stripe')
  )
}

/**
 * Turns whatever came out of a `catch` into something a person can act on.
 *
 * Both checkout routes end in `catch (e) { console.error(…, e) }`, which
 * printed a stack trace and left the two questions that matter — whose
 * fault is this, and what do I change — to be inferred from it. Worse,
 * the two kinds are indistinguishable at the call site without this:
 * `StripeConfigError` means the deployment is wrong and no amount of
 * retrying will help, while a `StripeAuthenticationError` means the key
 * reached Stripe and was refused.
 *
 * The advice is deliberately specific about *which* mistake produces each
 * error, because the generic Stripe wording rarely is. "No such price"
 * says nothing about test and live being separate object spaces, which is
 * the usual cause.
 */
export function describeStripeFailure(error: unknown): StripeFailure {
  if (error instanceof StripeConfigError) {
    return {
      kind: 'config',
      variable: error.variable,
      summary: `Stripe is misconfigured: ${error.message}`,
      advice: error.message,
    }
  }

  if (isStripeErrorLike(error)) {
    const { type, code, statusCode, requestId, param, message } = error
    const summary = [
      `Stripe rejected the request: ${type}`,
      code ? ` (${code})` : '',
      statusCode ? ` HTTP ${statusCode}` : '',
      message ? ` — ${redactKeys(message)}` : '',
      param ? ` [param ${param}]` : '',
      requestId ? ` [request ${requestId}]` : '',
    ].join('')

    return { kind: 'stripe', summary, advice: adviceForStripeError(type, code, message) }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    kind: 'unknown',
    summary: `Checkout failed: ${redactKeys(message)}`,
    advice: 'This is not an error Stripe reported, so check the server log for the full stack trace.',
  }
}

function adviceForStripeError(type?: string, code?: string, message?: string): string {
  switch (type) {
    case 'StripeAuthenticationError':
      return (
        'Stripe refused the key itself. It has been revoked or rolled, or it belongs to a ' +
        'different account. Copy STRIPE_SECRET_KEY again from Developers → API keys and redeploy.'
      )
    case 'StripePermissionError':
      return (
        'The key authenticated but is not allowed to do this — a restricted key (rk_…) needs ' +
        'write permission on Checkout Sessions and Customers.'
      )
    case 'StripeConnectionError':
      return 'The server could not reach Stripe. This is usually transient; retrying is reasonable.'
    case 'StripeRateLimitError':
      return 'Stripe is rate-limiting this account. Retry shortly.'
    case 'StripeAPIError':
      return (
        'Stripe returned something the library could not read. If this persists rather than being ' +
        'a blip, check status.stripe.com and whether anything between this server and Stripe ' +
        'is intercepting the connection.'
      )
    case 'StripeInvalidRequestError':
      if (code === 'resource_missing') {
        return (
          'Stripe has no such object under this key. Test and live are separate spaces, so a live ' +
          'price or customer id used with a test key (or the reverse) reads as missing even though ' +
          'the value was copied correctly. Check that STRIPE_SECRET_KEY and the price ids are ' +
          'from the same mode.'
        )
      }
      if (message && /activate|live mode/i.test(message)) {
        return (
          'The account cannot take live payments yet. Stripe requires the business details to be ' +
          'submitted and approved before live charges work — see the activation checklist on the ' +
          'Stripe dashboard. A test key works in the meantime.'
        )
      }
      return 'Stripe rejected the details of the request; its message above names the field.'
    default:
      return 'See the message above — it is Stripe\'s own description of what it refused.'
  }
}

export interface StripeConfigProblem {
  variable: string
  message: string
  /**
   * What stops working. `payments` is everything including donations;
   * `pro` is only the subscription plans, since donations build their
   * price inline and need no Price id; `settlement` means payments still
   * go through but nothing records them.
   */
  affects: 'payments' | 'pro' | 'settlement'
}

/**
 * Every configuration fault at once, without throwing — for a diagnostics
 * view, where the operator wants the whole list rather than whichever one
 * a particular code path happened to hit first.
 *
 * Deliberately reuses `getStripe()` and `priceIdFor()` rather than
 * re-stating their rules: a check that can drift out of step with the
 * thing it checks is worse than no check, because it reports health while
 * payment fails.
 */
export function stripeConfigProblems(): StripeConfigProblem[] {
  const problems: StripeConfigProblem[] = []

  const collect = (affects: StripeConfigProblem['affects'], probe: () => unknown): void => {
    try {
      probe()
    } catch (e) {
      if (!(e instanceof StripeConfigError)) throw e
      problems.push({ variable: e.variable, message: e.message, affects })
    }
  }

  collect('payments', () => getStripe())
  for (const plan of Object.keys(PRO_PLANS) as ProPlanId[]) {
    collect('pro', () => priceIdFor(plan))
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    problems.push({
      variable: 'STRIPE_WEBHOOK_SECRET',
      affects: 'settlement',
      message:
        'STRIPE_WEBHOOK_SECRET is not set, so the webhook rejects every event Stripe sends. ' +
        'Checkout still opens and cards are still charged — but no donation is ever marked paid ' +
        'and no Pro subscription is ever granted. Add the endpoint under Developers → Webhooks ' +
        'and copy its signing secret.',
    })
  }

  return problems
}
