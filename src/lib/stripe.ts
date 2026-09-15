import Stripe from 'stripe'

/**
 * RL-017: single Stripe client + plan config. Three purchase options per
 * the ticket — Monthly/Annual are recurring Prices, Lifetime is a
 * one-time Price. Price IDs are configured in the Stripe dashboard (RON
 * currency) and referenced here by env var rather than hardcoded, since
 * they differ between test and live mode.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
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
  const priceId = process.env[PRO_PLANS[plan].envVar]
  if (!priceId) throw new Error(`${PRO_PLANS[plan].envVar} is not set`)
  return priceId
}
