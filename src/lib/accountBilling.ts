import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { isMissingCustomerError } from '@/lib/stripeCustomer'

/**
 * Subscriptions Stripe will still charge. `canceled` and
 * `incomplete_expired` are finished; everything else (active, trialing,
 * past_due, unpaid, paused, incomplete) can still bill or be revived.
 */
const FINISHED: ReadonlySet<Stripe.Subscription.Status> = new Set(['canceled', 'incomplete_expired'])

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'resource_missing'
}

/**
 * Deleting an account cancels its own Personal subscription first, or
 * Stripe keeps charging a card for an account that no longer exists and
 * that nobody can sign in to cancel.
 *
 * Every live subscription on the account's customer is cancelled, not
 * only the stored `stripeSubscriptionId`: that column holds the latest
 * one, and a second checkout completed in another tab would leave an
 * earlier one charging unseen. The stored id is cancelled too, in case
 * the customer column was reset (a key switched between test and live).
 *
 * Cancelled at once, not at the period's end: there is no account left to
 * use the rest of the period. A subscription or customer Stripe does not
 * know is already not charging, so it is skipped. Any other failure
 * throws, and the caller must not delete the account — it would be gone
 * while the card is still billed. A Lifetime purchase has no subscription,
 * so there is nothing to call.
 */
export async function cancelPersonalSubscriptions(account: {
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}): Promise<string[]> {
  const { stripeCustomerId, stripeSubscriptionId } = account
  if (!stripeCustomerId && !stripeSubscriptionId) return []
  const stripe = getStripe()

  const live = new Set<string>()
  const seen = new Set<string>()
  if (stripeCustomerId) {
    try {
      for await (const sub of stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 100 })) {
        seen.add(sub.id)
        if (!FINISHED.has(sub.status)) live.add(sub.id)
      }
    } catch (e) {
      if (!isMissingCustomerError(e, stripeCustomerId)) throw e
    }
  }
  if (stripeSubscriptionId && !seen.has(stripeSubscriptionId)) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
      if (!FINISHED.has(sub.status)) live.add(sub.id)
    } catch (e) {
      if (!isMissing(e)) throw e
    }
  }

  const cancelled: string[] = []
  for (const id of live) {
    try {
      await stripe.subscriptions.cancel(id)
      cancelled.push(id)
    } catch (e) {
      if (!isMissing(e)) throw e
    }
  }
  return cancelled
}
