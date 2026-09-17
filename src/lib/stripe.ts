import Stripe from 'stripe'

/**
 * RL-017: single Stripe client + plan config. Three purchase options per
 * the ticket — Monthly/Annual are recurring Prices, Lifetime is a
 * one-time Price. Price IDs are configured in the Stripe dashboard (RON
 * currency) and referenced here by env var rather than hardcoded, since
 * they differ between test and live mode.
 */
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
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (key.startsWith('pk_')) {
    throw new Error(
      'STRIPE_SECRET_KEY holds a publishable key (pk_…). The secret key starts with sk_ and is ' +
        'shown under Developers → API keys → Secret key.'
    )
  }
  if (!key.startsWith('sk_') && !key.startsWith('rk_')) {
    throw new Error(`STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_… or rk_…)`)
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
  if (!priceId) throw new Error(`${envVar} is not set`)

  // The usual slip is pasting the *product* id, or the payment-link URL,
  // from the same dashboard page. Stripe's own answer to that is "No such
  // price", which names the value but not the variable that carried it.
  if (priceId.startsWith('prod_')) {
    throw new Error(
      `${envVar} holds a product id (${priceId}). It needs the Price id under that product — ` +
        'Stripe dashboard → Product catalogue → the product → its price, which starts with price_.'
    )
  }
  if (/^https?:\/\//i.test(priceId)) {
    throw new Error(`${envVar} holds a URL. It needs a Price id (price_…), not a payment link.`)
  }
  if (!priceId.startsWith('price_')) {
    throw new Error(`${envVar} is "${priceId}", which is not a Stripe Price id — they start with price_.`)
  }

  // Test and live are separate object spaces: a live price id under a test
  // key (or the reverse) fails with "No such price" even though both
  // values are real and correctly copied. The prefix does not distinguish
  // them, so this cannot be checked here — DEPLOY.md says it instead.
  return priceId
}
