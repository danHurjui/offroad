import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { canManageOrganization } from '@/lib/organizations'
import { describeStripeFailure, getStripe } from '@/lib/stripe'
import { requireAppUrl } from '@/lib/appUrl'
import { forgetOrgStripeCustomer, isMissingCustomerError } from '@/lib/stripeCustomer'
import { loadMembership } from '../../../load'

type Params = { params: { orgId: string } }

/**
 * RL-042 slice 3: the Stripe billing portal for the organisation's own
 * customer — change plan, update the card, invoices, cancel. OWNERs only.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadMembership(params.orgId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const org = loaded.membership.organization
  const customerId = org.stripeCustomerId
  if (!customerId) return await apiError('noBillingAccount', 400)

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${requireAppUrl()}/dashboard/organizations/${org.id}/billing`,
    })
    return NextResponse.json({ url: portal.url })
  } catch (e) {
    if (isMissingCustomerError(e, customerId)) {
      await forgetOrgStripeCustomer(org.id, customerId)
      return await apiError('noBillingAccount', 400)
    }
    const failure = describeStripeFailure(e)
    console.error(`[billing] ${failure.summary}\n[billing] ${failure.advice}`)
    if (failure.kind === 'config') return await apiError('paymentsUnavailable', 503)
    return await apiError('billingPortalFailed', 500)
  }
}
