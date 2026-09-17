import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { getStripe } from '@/lib/stripe'
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

  try {
    const stripe = getStripe()
    const baseUrl = requireAppUrl()
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/settings`,
    })
    return NextResponse.json({ url: portalSession.url })
  } catch (e) {
    console.error('Stripe portal session failed:', e)
    return await apiError('billingPortalFailed', 500)
  }
}
