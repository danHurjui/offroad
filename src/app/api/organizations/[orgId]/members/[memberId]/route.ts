import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { canManageOrganization, isOrgRole, lastOwnerBlocks, lockOrganization, type MemberChange } from '@/lib/organizations'
import { loadMembership } from '../../../load'
import { endAssignmentsFor } from '@/lib/assignments'

type Params = { params: { orgId: string; memberId: string } }

type Outcome = { ok: true; member?: unknown } | { ok: false; status: 404 | 409 }

/**
 * Applies a change to one membership under the organisation's row lock,
 * so the owner count it checks is the one the write lands against.
 */
async function applyChange(orgId: string, memberId: string, change: MemberChange): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockOrganization(tx, orgId))) return { ok: false, status: 404 }
    const target = await tx.organizationMember.findUnique({ where: { id: memberId } })
    if (!target || target.organizationId !== orgId) return { ok: false, status: 404 }
    const owners = await tx.organizationMember.count({ where: { organizationId: orgId, role: 'OWNER' } })
    if (lastOwnerBlocks({ role: target.role }, change, owners)) return { ok: false, status: 409 }
    // RL-040: someone who stops being a DRIVER here stops driving its
    // vehicles, in the same transaction.
    if (target.role === 'DRIVER' && (change.kind === 'remove' || change.role !== 'DRIVER')) {
      await endAssignmentsFor(tx, { organizationId: orgId, driverUserId: target.userId })
    }
    if (change.kind === 'remove') {
      await tx.organizationMember.delete({ where: { id: memberId } })
      return { ok: true }
    }
    const member = await tx.organizationMember.update({ where: { id: memberId }, data: { role: change.role } })
    return { ok: true, member }
  })
}

async function respond(outcome: Outcome) {
  if (outcome.ok) return NextResponse.json(outcome.member ?? { ok: true })
  return outcome.status === 409 ? await apiError('orgLastOwner', 409) : await apiError('notFound', 404)
}

/** Changes a member's role. Owners only — including handing on OWNER. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  if (!isOrgRole(parsed.body.role)) return await apiError('orgRoleInvalid', 400)

  try {
    return await respond(await applyChange(params.orgId, params.memberId, { kind: 'role', role: parsed.body.role }))
  } catch {
    return await apiError('internalError', 500)
  }
}

/** Removes a member (owners), or leaves (anyone, their own membership). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  const leaving = loaded.membership.id === params.memberId
  if (!leaving && !canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  try {
    return await respond(await applyChange(params.orgId, params.memberId, { kind: 'remove' }))
  } catch {
    return await apiError('internalError', 500)
  }
}
