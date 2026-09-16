/**
 * Pro entitlement, decided in one place.
 *
 * There are two independent sources of Pro access and they have different
 * owners:
 *
 * - **`isPro`** — paid, written *only* by the Stripe webhook
 *   (src/app/api/webhooks/stripe/route.ts). It goes false on cancellation.
 * - **`isProComped`** — complimentary, granted by an admin. Stripe never
 *   touches it, which is the whole point of it being a separate column:
 *   a cancellation event must not quietly revoke a comp, and a comp must
 *   not look like a payment that never happened.
 *
 * Every gate must ask `hasPro()` rather than testing either flag, or a
 * comped account ends up with half the Pro features working. Select the
 * fields with PRO_SELECT so a gate can't accidentally read one and miss
 * the other.
 */

export const PRO_SELECT = { isPro: true, isProComped: true } as const

export interface ProStatusLike {
  isPro: boolean
  isProComped: boolean
}

/** True when the user is entitled to Pro features, paid or comped. */
export function hasPro(user: ProStatusLike | null | undefined): boolean {
  if (!user) return false
  return user.isPro === true || user.isProComped === true
}

/**
 * How the entitlement should be described to a human. Kept distinct from
 * `hasPro` so the UI can be honest — someone on a comp shouldn't be shown
 * a billing plan they never bought, and shouldn't be nagged to upgrade.
 */
export type ProKind = 'none' | 'paid' | 'comped'

export function proKind(user: ProStatusLike | null | undefined): ProKind {
  if (!user) return 'none'
  // Paid wins the label when someone has both: they are actually being
  // billed, and that's the fact that matters for support and for billing
  // portal access.
  if (user.isPro) return 'paid'
  if (user.isProComped) return 'comped'
  return 'none'
}
