import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { canManageOrganization, parseOrganization } from '@/lib/organizations'
import { loadMembership } from '../load'

type Params = { params: { orgId: string } }

/**
 * The organisation and its members, for any member. Addresses are shown to
 * owners only — running the membership is theirs, and a driver has no need
 * of a colleague's email.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  const manager = canManageOrganization(loaded.role)

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: params.orgId },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({
    ...loaded.membership.organization,
    role: loaded.role,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      displayName: m.user.displayName,
      email: manager ? m.user.email : null,
      createdAt: m.createdAt,
    })),
  })
}

/** Name, CUI and billing address. Owners only. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const result = parseOrganization(parsed.body, { create: false })
  if (!result.ok) return await apiErrorWith('orgFieldInvalid', { field: result.field }, 400)

  try {
    const organization = await prisma.organization.update({ where: { id: params.orgId }, data: result.data })
    return NextResponse.json(organization)
  } catch {
    return await apiError('internalError', 500)
  }
}

/**
 * Deletes the organisation and every membership in it. Owners only.
 * Refused while it still has vehicles (the foreign key is Restrict too):
 * what happens to a company's vehicles and their files is the next
 * slice's decision, not an accident of this one.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const vehicles = await prisma.vehicle.count({ where: { organizationId: params.orgId } })
  if (vehicles > 0) return await apiErrorWith('orgHasVehicles', { count: vehicles }, 409)

  try {
    await prisma.organization.delete({ where: { id: params.orgId } })
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
