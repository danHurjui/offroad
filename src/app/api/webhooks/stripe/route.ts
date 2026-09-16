import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe, isProPlanId } from '@/lib/stripe'
import { sendEmail, paymentFailedEmailHtml } from '@/lib/email'

/**
 * RL-017: Stripe webhook — the only place `User.isPro` is ever written.
 * Signature is verified against the raw request body before anything is
 * read from the event, per the ticket's requirement and Stripe's own
 * guidance (a route handler's req.text() is the unparsed body, unlike
 * Pages API routes which need bodyParser disabled for this).
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session

        // Donations share this event with Pro purchases. They're settled
        // first and then we're done — a donation must never fall through
        // to the Pro branch and grant isPro.
        if (checkoutSession.metadata?.kind === 'donation') {
          // updateMany, keyed on the session id, is the idempotency guard:
          // Stripe retries this event, and `status: PENDING` in the filter
          // means a redelivery updates nothing the second time round.
          await prisma.donation.updateMany({
            where: { stripeSessionId: checkoutSession.id, status: 'PENDING' },
            data: {
              status: 'PAID',
              paidAt: new Date(),
              email: checkoutSession.customer_details?.email ?? undefined,
            },
          })
          break
        }

        const userId = checkoutSession.metadata?.userId
        const plan = checkoutSession.metadata?.plan
        if (!userId || !isProPlanId(plan)) break

        const customerId = typeof checkoutSession.customer === 'string' ? checkoutSession.customer : checkoutSession.customer?.id
        const subscriptionId =
          checkoutSession.mode === 'subscription'
            ? typeof checkoutSession.subscription === 'string'
              ? checkoutSession.subscription
              : checkoutSession.subscription?.id
            : null

        await prisma.user.update({
          where: { id: userId },
          data: {
            isPro: true,
            proPlan: plan,
            stripeCustomerId: customerId ?? undefined,
            stripeSubscriptionId: subscriptionId ?? undefined,
            proPaymentFailedAt: null,
          },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break

        const user = await prisma.user.update({
          where: { stripeCustomerId: customerId },
          data: { proPaymentFailedAt: new Date() },
        }).catch(() => null)

        if (user) {
          const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
          await sendEmail({
            to: user.email,
            subject: 'Your RigLog Pro payment failed',
            html: paymentFailedEmailHtml(`${baseUrl}/dashboard/settings`),
          })
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break

        await prisma.user
          .update({ where: { stripeCustomerId: customerId }, data: { proPaymentFailedAt: null } })
          .catch(() => null)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await prisma.user
          .update({
            where: { stripeSubscriptionId: subscription.id },
            data: { isPro: false, proPlan: null, stripeSubscriptionId: null },
          })
          .catch(() => null)
        break
      }

      default:
        break
    }
  } catch (e) {
    console.error('Stripe webhook handling failed:', e)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
