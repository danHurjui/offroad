import { prisma } from '@/lib/prisma'

/**
 * `User.stripeCustomerId` outlives the key that created it.
 *
 * A Stripe customer belongs to one account *and one mode*. Test and live
 * are separate object spaces, so `cus_123` created while
 * STRIPE_SECRET_KEY held a test key does not exist once the key is
 * switched to live — and neither exists if the deployment is pointed at a
 * different Stripe account altogether.
 *
 * All three checkout paths read that stored id and hand it straight to
 * Stripe, and only ever call `customers.create()` when the column is
 * null. So the row is never repaired: going live after testing, or
 * rotating to a new account, permanently breaks payment for exactly the
 * users who had already reached checkout once — Pro *and* donations,
 * since the donation route reuses the same id to attribute the charge.
 * It presents as "checkout never opens", with "No such customer" in a log
 * nobody is reading.
 *
 * The repair is optimistic rather than a verifying round trip: the happy
 * path must not pay for an extra API call on every checkout, so the id is
 * used as-is and only replaced if Stripe says it is missing.
 */

/** Stripe's error objects, as much of them as we read. */
interface StripeErrorLike {
  code?: string
  param?: string
  message?: string
}

/**
 * Whether Stripe refused this request because *the customer* is unknown
 * to it.
 *
 * `resource_missing` is also how a missing Price reports itself, and the
 * Pro checkout passes both in one call — so answering "is the customer
 * stale?" has to establish which object Stripe meant. `param` says so
 * directly; the id appearing in the message ("No such customer:
 * cus_123") is the fallback, since `param` is not documented as
 * guaranteed and guessing wrong here would discard a perfectly good
 * customer id.
 */
export function isMissingCustomerError(error: unknown, customerId: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, param, message } = error as StripeErrorLike
  if (code !== 'resource_missing') return false
  if (param === 'customer') return true
  return Boolean(customerId && message?.includes(customerId))
}

/**
 * Drops a customer id Stripe no longer recognises, so the next checkout
 * mints a fresh one instead of failing the same way forever.
 *
 * Worth being clear about the risk being taken: if Stripe ever reported
 * `resource_missing` for a customer that does in fact exist, this would
 * unlink it and a new customer object would be created alongside. That
 * costs a duplicate record in the Stripe dashboard — it loses no data
 * here, and `User.isPro` is keyed off the webhook's `userId` metadata
 * rather than this column, so entitlement is unaffected either way. The
 * alternative, leaving the row alone, is a user who can never pay again.
 */
export async function forgetStripeCustomer(userId: string, customerId: string): Promise<void> {
  console.warn(
    `[billing] Stripe does not recognise customer ${customerId} for user ${userId}. This normally ` +
      'means STRIPE_SECRET_KEY now points at a different account, or was switched between test ' +
      'and live. Unlinking it so a new customer is created.'
  )
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: null } })
}
