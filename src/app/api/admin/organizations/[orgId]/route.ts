import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'

/**
 * RL-042 (#54): an admin comps an organisation — no charge and no vehicle
 * cap — or ends a comp. That is the only field here, copied onto the
 * update rather than merged, like the user PATCH beside it; `isAdmin`
 * still grants no access to the organisation's records.
 *
 * - **Comping one that pays is refused** (409): its subscription would go
 *   on charging a company that is told it is free. Cancel it in the
 *   organisation's billing portal first.
 * - **Ending a comp** leaves its plan, if any, in charge. With no plan the
 *   organisation's vehicles turn read-only — never hidden or deleted — so
 *   the admin screen asks before sending this.
 */
export async function PATCH(req: NextRequest, { params }: { params: { orgId: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  if (typeof parsed.body.comped !== 'boolean') return await apiError('adminOrgFieldsLimited', 400)
  const comped = parsed.body.comped

  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { id: true, compedAt: true, stripeSubscriptionId: true },
  })
  if (!org) return await apiError('notFound', 404)
  if (comped && org.stripeSubscriptionId) return await apiError('orgCompWhilePaying', 409)
  // Already in the asked state: keep the original date.
  if (comped === (org.compedAt !== null)) return NextResponse.json({ id: org.id, compedAt: org.compedAt })

  try {
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: { compedAt: comped ? new Date() : null },
      select: { id: true, compedAt: true },
    })
    return NextResponse.json(updated)
  } catch {
    return await apiError('internalError', 500)
  }
}
