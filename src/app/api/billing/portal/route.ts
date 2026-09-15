import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { getStripe } from '@/lib/stripe'

// RL-017: opens the Stripe Customer Portal — subscription cancel/update
// card, linked from account settings.
export async function POST(_req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { stripeCustomerId: true } })
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account yet' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/settings`,
    })
    return NextResponse.json({ url: portalSession.url })
  } catch (e) {
    console.error('Stripe portal session failed:', e)
    return NextResponse.json({ error: 'Could not open billing portal' }, { status: 500 })
  }
}
