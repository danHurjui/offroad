/**
 * Donation amounts and validation.
 *
 * Unlike the Pro plans (src/lib/stripe.ts), donations don't use
 * pre-configured Stripe Price IDs — the whole point is that the supporter
 * picks the amount, and a fixed Price per preset would mean creating (and
 * keeping in sync) a Price in the Stripe dashboard for every option plus
 * no custom amounts at all. The checkout route builds `price_data`
 * inline instead, so donations need no Stripe setup beyond the
 * STRIPE_SECRET_KEY the app already has.
 *
 * Amounts are handled in bani (RON minor units) throughout — Stripe wants
 * an integer minor unit, and it keeps float rounding out of money maths.
 */

export const DONATION_CURRENCY = 'ron'

/** Preset buttons, in RON. The custom field covers everything else. */
export const DONATION_PRESETS_RON = [25, 50, 100, 250] as const

/** Stripe rejects tiny charges, and a cap keeps a typo'd amount from going through. */
export const MIN_DONATION_BANI = 5_00
export const MAX_DONATION_BANI = 50_000_00

export const DONATION_MESSAGE_MAX = 280

export function baniToRon(bani: number): number {
  return bani / 100
}

export function formatRon(bani: number): string {
  return `${baniToRon(bani).toLocaleString('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} RON`
}

/**
 * Parses a client-supplied amount in RON into bani.
 *
 * Returns undefined for anything that isn't a real, in-range amount. The
 * client sends the amount (it's their choice how much to give), so this
 * is the only thing standing between a typo — or a hand-crafted request —
 * and a charge, and it runs server-side before Checkout is created.
 */
export function parseDonationBani(amountRon: unknown): number | undefined {
  if (typeof amountRon !== 'number' && typeof amountRon !== 'string') return undefined
  const ron = Number(amountRon)
  if (!Number.isFinite(ron) || ron <= 0) return undefined
  // Round to the nearest ban: 12.345 RON isn't a chargeable amount.
  const bani = Math.round(ron * 100)
  if (bani < MIN_DONATION_BANI || bani > MAX_DONATION_BANI) return undefined
  return bani
}

/** How a supporter is credited on the public list. */
export function supporterName(
  donation: { isAnonymous: boolean; user: { displayName: string } | null },
): string {
  if (donation.isAnonymous || !donation.user) return 'Anonymous'
  return donation.user.displayName
}
