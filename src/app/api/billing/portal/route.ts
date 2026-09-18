import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { getStripe, describeStripeFailure } from '@/lib/stripe'
import { isMissingCustomerError, forgetStripeCustomer } from '@/lib/stripeCustomer'
import { requireAppUrl } from '@/lib/appUrl'

// RL-017: opens the Stripe Customer Portal — subscription cancel/update
// card, linked from account settings.
export async function POST(_req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { stripeCustomerId: true } })
  if (!user?.stripeCustomerId) {
    return await apiError('noBillingAccount', 400)
  }

  const customerId = user.stripeCustomerId

  try {
    const stripe = getStripe()
    const baseUrl = requireAppUrl()
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard/settings`,
    })
    return NextResponse.json({ url: portalSession.url })
  } catch (e) {
    // Unlike the two checkout routes, there is nothing to re-create here:
    // a portal with no customer behind it has nothing to show. Unlinking
    // the dead id and saying so is the honest answer, and it lets the
    // next purchase mint a fresh customer.
    if (isMissingCustomerError(e, customerId)) {
      await forgetStripeCustomer(session.user.id, customerId)
      return await apiError('noBillingAccount', 400)
    }
    const failure = describeStripeFailure(e)
    console.error(`[billing] ${failure.summary}\n[billing] ${failure.advice}`)
    if (failure.kind === 'config') {
      return await apiError('paymentsUnavailable', 503)
    }
    console.error('Stripe portal session failed:', e)
    return await apiError('billingPortalFailed', 500)
  }
}
