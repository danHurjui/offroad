import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { apiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe, describeStripeFailure } from '@/lib/stripe'
import { isMissingCustomerError, forgetStripeCustomer } from '@/lib/stripeCustomer'
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
  if (!limit.ok) return await rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const amountBani = parseDonationBani(body.amountRon)
  if (amountBani === undefined) {
    return await apiError('donationAmountInvalid', 400)
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

    // A donation needs no Customer object of its own — the id is reused
    // only so a supporter's charges group under the account they already
    // have. Falling back to the plain email is therefore a complete
    // fallback, not a degraded one.
    const byEmail = user?.email ? { customer_email: user.email } : {}
    const openCheckout = (payer: Pick<Stripe.Checkout.SessionCreateParams, 'customer' | 'customer_email'>) =>
      stripe.checkout.sessions.create({
        ...payer,
        mode: 'payment',
        // Managed Payments — Stripe acting as merchant of record — is on by
        // default for new accounts, and it requires every line item to carry
        // a product tax code. A donation has no product to classify: it is a
        // contribution towards hosting, not a sale, so there is no honest tax
        // code to give it, and putting a gift through merchant-of-record
        // would have Stripe sell something on the site's behalf and take a
        // further cut of it. Opting this session out is Stripe's own
        // suggested alternative and keeps the arrangement as it was.
        //
        // The Pro plans are deliberately left alone: their Prices are
        // configured in the Stripe dashboard, where a tax code can be set on
        // the product, so whether to use merchant of record for an actual
        // sale stays the operator's decision.
        //
        // Safe on accounts old enough to predate the feature — Stripe treats
        // a new optional request parameter as backwards-compatible across
        // every API version.
        managed_payments: { enabled: false },
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

    let checkoutSession
    try {
      checkoutSession = await openCheckout(
        user?.stripeCustomerId ? { customer: user.stripeCustomerId } : byEmail
      )
    } catch (e) {
      // The stored customer id can predate a key change and no longer
      // exist — see src/lib/stripeCustomer.ts. Don't let that stop a
      // donation that needs no customer in the first place.
      if (!user?.stripeCustomerId || !isMissingCustomerError(e, user.stripeCustomerId)) throw e
      await forgetStripeCustomer(user.id, user.stripeCustomerId)
      checkoutSession = await openCheckout(byEmail)
    }

    if (!checkoutSession.url) {
      return await apiError('checkoutCreateFailed', 500)
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
    // A donation failing because *this site* is misconfigured is not the
    // donor's problem and not something retrying fixes, so it doesn't get
    // the same answer as a payment that genuinely failed. See
    // describeStripeFailure() for why the two are worth telling apart.
    const failure = describeStripeFailure(e)
    console.error(`[donation] ${failure.summary}\n[donation] ${failure.advice}`)
    if (failure.kind === 'config') {
      return await apiError('paymentsUnavailable', 503)
    }
    // Only a configuration fault is fully described by its message; keep
    // the original for anything else, since the stack is the useful part.
    console.error('Donation checkout failed:', e)
    return await apiError('checkoutStartFailed', 500)
  }
}
