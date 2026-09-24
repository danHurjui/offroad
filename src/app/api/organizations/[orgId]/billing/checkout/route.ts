import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { canManageOrganization } from '@/lib/organizations'
import { isOrgPlanId } from '@/lib/plans'
import { describeStripeFailure, getStripe, orgPriceIdFor } from '@/lib/stripe'
import { requireAppUrl } from '@/lib/appUrl'
import { forgetOrgStripeCustomer, isMissingCustomerError } from '@/lib/stripeCustomer'
import { loadMembership } from '../../../load'

type Params = { params: { orgId: string } }

/**
 * RL-042 slice 3: a Stripe Checkout for one of the company plans, paid by
 * the organisation. **OWNERs only** — a fleet manager runs the fleet and
 * does not hold the card. Like the personal checkout, reaching the success
 * URL proves nothing: the webhook writes `plan`, keyed on the `orgId` in
 * the session's metadata.
 *
 * The organisation has its own Stripe customer, never a member's, so the
 * card and the invoices are the company's and outlive whoever set them up.
 * A plan already running is changed in the billing portal, not bought
 * again here.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const plan = parsed.body.plan
  if (!isOrgPlanId(plan)) return await apiError('invalidPlan', 400)

  const org = loaded.membership.organization
  if (org.compedAt) return await apiError('orgComped', 400)
  if (org.stripeSubscriptionId) return await apiError('orgAlreadySubscribed', 409)

  try {
    const stripe = getStripe()
    // Configuration first, before anything is created in Stripe — same
    // reasoning as the personal checkout.
    const priceId = orgPriceIdFor(plan)
    const baseUrl = requireAppUrl()
    const metadata = { kind: 'organization', orgId: org.id, plan }

    const createCustomer = async (): Promise<string> => {
      const customer = await stripe.customers.create({
        name: org.name,
        email: session.user.email ?? undefined,
        metadata: { orgId: org.id, ...(org.cui ? { cui: org.cui } : {}) },
      })
      await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customer.id } })
      return customer.id
    }

    const openCheckout = (customer: string) =>
      stripe.checkout.sessions.create({
        customer,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/dashboard/organizations/${org.id}/billing?subscribed=1`,
        cancel_url: `${baseUrl}/dashboard/organizations/${org.id}/billing?canceled=1`,
        metadata,
        subscription_data: { metadata },
      })

    let customerId = org.stripeCustomerId ?? (await createCustomer())
    let checkout
    try {
      checkout = await openCheckout(customerId)
    } catch (e) {
      if (!isMissingCustomerError(e, customerId)) throw e
      await forgetOrgStripeCustomer(org.id, customerId)
      customerId = await createCustomer()
      checkout = await openCheckout(customerId)
    }
    if (!checkout.url) return await apiError('checkoutCreateFailed', 500)
    return NextResponse.json({ url: checkout.url })
  } catch (e) {
    const failure = describeStripeFailure(e)
    console.error(`[billing] ${failure.summary}\n[billing] ${failure.advice}`)
    if (failure.kind === 'config') return await apiError('paymentsUnavailable', 503)
    return await apiError('checkoutStartFailed', 500)
  }
}
