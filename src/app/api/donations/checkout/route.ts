import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { readJsonBody } from '@/lib/requestBody'
import { parseDonationBani, DONATION_CURRENCY, DONATION_MESSAGE_MAX } from '@/lib/donations'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { requireAppUrl } from '@/lib/appUrl'

/**
 * Starts a Stripe Checkout session for a one-off donation.
 *
 * Deliberately **not** behind requireSession(): a supporter shouldn't need
 * an account to chip in. A session, if there is one, only attributes the
 * donation to that user for the supporters list.
 *
 * Uses inline `price_data` rather than a configured Price ID so the
 * supporter picks the amount — see src/lib/donations.ts. The amount is
 * validated and clamped here, server-side, because it arrives from the
 * client.
 *
 * The Donation row is created PENDING; only the webhook marks it PAID.
 */
export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit('donationCheckout', `ip:${clientIp(req.headers)}`)
  if (!limit.ok) return rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const amountBani = parseDonationBani(body.amountRon)
  if (amountBani === undefined) {
    return NextResponse.json({ error: 'Please choose a valid donation amount' }, { status: 400 })
  }

  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, DONATION_MESSAGE_MAX)
      : null
  const isAnonymous = Boolean(body.isAnonymous)

  try {
    const session = await getServerSession(authOptions)
    const user = session
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, email: true, stripeCustomerId: true },
        })
      : null

    const stripe = getStripe()
    const baseUrl = requireAppUrl()

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(user?.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : user?.email
          ? { customer_email: user.email }
          : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: DONATION_CURRENCY,
            unit_amount: amountBani,
            product_data: {
              name: 'Support RigLog',
              description: 'A one-off contribution towards hosting and development',
            },
          },
        },
      ],
      success_url: `${baseUrl}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/donate?canceled=1`,
      // `kind` is what tells the webhook this is a donation and not a Pro
      // purchase — without it the Pro branch would ignore it anyway (it
      // requires a valid plan), but being explicit keeps the two apart.
      metadata: {
        kind: 'donation',
        userId: user?.id ?? '',
        message: message ?? '',
        isAnonymous: isAnonymous ? '1' : '0',
      },
      payment_intent_data: { metadata: { kind: 'donation', userId: user?.id ?? '' } },
    })

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 })
    }

    await prisma.donation.create({
      data: {
        userId: user?.id ?? null,
        email: user?.email ?? null,
        amountBani,
        currency: DONATION_CURRENCY,
        message,
        isAnonymous,
        stripeSessionId: checkoutSession.id,
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (e) {
    console.error('Donation checkout failed:', e)
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 })
  }
}
