import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe, orgPlanForPriceId } from '@/lib/stripe'
import { isOrgPlanId, isStoredPlanId } from '@/lib/plans'
import { sendEmail, paymentFailedEmail, emailLocale } from '@/lib/email'
import { appUrlForNotification } from '@/lib/appUrl'

/**
 * RL-017: Stripe webhook — the only place `User.isPro` is ever written.
 * Signature is verified against the raw request body before anything is
 * read from the event, per the ticket's requirement and Stripe's own
 * guidance (a route handler's req.text() is the unparsed body, unlike
 * Pages API routes which need bodyParser disabled for this).
 */
/** A Stripe reference that may arrive expanded or as a bare id. */
function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

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

        // RL-042 slice 3: a company plan, paid by an organisation. Also
        // settled on its own and then done — it must never reach the
        // personal branch below and grant a member `isPro`.
        if (checkoutSession.metadata?.kind === 'organization') {
          const orgId = checkoutSession.metadata.orgId
          const orgPlan = checkoutSession.metadata.plan
          if (!orgId || !isOrgPlanId(orgPlan)) break
          await prisma.organization.updateMany({
            where: { id: orgId },
            data: {
              plan: orgPlan,
              stripeCustomerId: idOf(checkoutSession.customer) ?? undefined,
              stripeSubscriptionId: idOf(checkoutSession.subscription) ?? undefined,
              paymentFailedAt: null,
            },
          })
          break
        }

        const userId = checkoutSession.metadata?.userId
        const plan = checkoutSession.metadata?.plan
        // Any stored plan, legacy included: a checkout opened just before the
        // ladder shipped can complete after it, and was paid for.
        if (!userId || !isStoredPlanId(plan)) break

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

        // An organisation's customer (slice 3): the banner on its billing
        // page, and the same email to each OWNER — the people who hold the
        // card. Access continues until Stripe gives up and deletes the
        // subscription, same as a personal plan.
        const org = await prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, members: { where: { role: 'OWNER' }, select: { user: { select: { email: true, locale: true } } } } },
        })
        if (org) {
          await prisma.organization.update({ where: { id: org.id }, data: { paymentFailedAt: new Date() } })
          const orgUrl = appUrlForNotification('the organisation payment-failed email')
          if (orgUrl) {
            for (const { user: owner } of org.members) {
              const { subject, html } = await paymentFailedEmail(emailLocale(owner), `${orgUrl}/dashboard/organizations/${org.id}/billing`)
              await sendEmail({ to: owner.email, subject, html }).catch((e) => console.error('[billing] payment-failed email failed:', e))
            }
          }
          break
        }

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
        await prisma.organization.updateMany({ where: { stripeCustomerId: customerId }, data: { paymentFailedAt: null } })
        break
      }

      // RL-042 slice 3: a company plan changed in the billing portal (a
      // bigger Fleet step, monthly to annual). The event names the new
      // Price; `orgPlanForPriceId()` maps it back. A Price that is none of
      // the configured ones changes nothing rather than guessing.
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const plan = orgPlanForPriceId(subscription.items?.data?.[0]?.price?.id)
        if (!plan) break
        await prisma.organization.updateMany({ where: { stripeSubscriptionId: subscription.id }, data: { plan } })
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
        // An organisation's plan ends the same way. Its vehicles stay, read-only.
        await prisma.organization.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { plan: null, stripeSubscriptionId: null },
        })
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
