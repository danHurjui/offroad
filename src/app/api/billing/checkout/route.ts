import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { getStripe, priceIdFor, PERSONAL_PLANS, describeStripeFailure } from '@/lib/stripe'
import { isPersonalPlanId } from '@/lib/plans'
import { readJsonBody } from '@/lib/requestBody'
import { hasPro, PRO_SELECT } from '@/lib/pro'
import { requireAppUrl } from '@/lib/appUrl'
import { isMissingCustomerError, forgetStripeCustomer } from '@/lib/stripeCustomer'

// RL-017: creates a Stripe Checkout session for one of the three Personal
// purchase options (RL-042: the plans sold before the ladder are refused
// here as unknown — nobody can buy one any more). The webhook (not this route) is what actually flips
// isPro — a client redirecting here successfully doesn't mean payment
// succeeded yet.
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const plan = body.plan
    if (!isPersonalPlanId(plan)) {
      return await apiError('invalidPlan', 400)
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ...PRO_SELECT, id: true, email: true, stripeCustomerId: true } })
    if (!user) return await apiError('notFound', 404)
    if (hasPro(user)) return await apiError('alreadyPro', 400)

    const stripe = getStripe()

    // Everything configuration-dependent is resolved before the first call
    // to Stripe. Two reasons, both learned the hard way:
    //
    // - creating the customer is itself a network call that depends on the
    //   key, so its failure was masking the real cause. A price id holding
    //   a product id reported "Invalid API Key"-shaped noise instead of
    //   naming STRIPE_PRICE_MONTHLY.
    // - that call also writes stripeCustomerId onto the user row. A
    //   request that cannot possibly succeed should not leave a Stripe
    //   customer behind it.
    const priceId = priceIdFor(plan)
    const baseUrl = requireAppUrl()
    const planConfig = PERSONAL_PLANS[plan]

    const createCustomer = async (): Promise<string> => {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } })
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } })
      return customer.id
    }

    const openCheckout = (customer: string) =>
      stripe.checkout.sessions.create({
        customer,
        mode: planConfig.mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/dashboard/settings?upgraded=1`,
        cancel_url: `${baseUrl}/dashboard/upgrade?canceled=1`,
        metadata: { userId: user.id, plan },
        ...(planConfig.mode === 'subscription'
          ? { subscription_data: { metadata: { userId: user.id, plan } } }
          : { payment_intent_data: { metadata: { userId: user.id, plan } } }) })

    let customerId = user.stripeCustomerId ?? (await createCustomer())

    let checkoutSession
    try {
      checkoutSession = await openCheckout(customerId)
    } catch (e) {
      // A stored id minted under a different key is not recoverable by
      // retrying it — see src/lib/stripeCustomer.ts. Replace it once and
      // try again rather than failing this user's checkout forever.
      if (!isMissingCustomerError(e, customerId)) throw e
      await forgetStripeCustomer(user.id, customerId)
      customerId = await createCustomer()
      checkoutSession = await openCheckout(customerId)
    }

    if (!checkoutSession.url) {
      return await apiError('checkoutCreateFailed', 500)
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (e) {
    const failure = describeStripeFailure(e)
    console.error(`[billing] ${failure.summary}\n[billing] ${failure.advice}`)
    if (failure.kind === 'config') {
      return await apiError('paymentsUnavailable', 503)
    }
    console.error('Stripe checkout failed:', e)
    return await apiError('checkoutStartFailed', 500)
  }
}
