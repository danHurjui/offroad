import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe, isProPlanId } from '@/lib/stripe'
import { sendEmail, paymentFailedEmail, emailLocale } from '@/lib/email'
import { appUrlForNotification } from '@/lib/appUrl'

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
    return await apiError('webhookNotConfigured', 400)
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e)
    return await apiError('invalidSignature', 400)
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

        const baseUrl = appUrlForNotification('the payment-failed email')
        // proPaymentFailedAt is already written above, so the in-app banner
        // still warns them even if this email cannot be built.
        if (user && baseUrl) {
          const { subject, html } = await paymentFailedEmail(
            emailLocale(user),
            `${baseUrl}/dashboard/settings`
          )
          await sendEmail({ to: user.email, subject, html })
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
    return await apiError('webhookFailed', 500)
  }

  return NextResponse.json({ received: true })
}
