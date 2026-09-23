import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { collectStorageKeys, deleteStoredFiles } from '@/lib/personalData'
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
 * Deletes the organisation, every membership in it and — RL-038 slice 4 —
 * its vehicles with all their records and files. Owners only.
 *
 * With vehicles, the body must carry `confirmName` equal to the
 * organisation's name: a request that deletes other people's working
 * history needs more than a click. Anyone wanting to keep a vehicle moves
 * it out first (DELETE /api/vehicles/[id]/organization).
 *
 * Files are gathered before the delete (pitfall #14) and removed after it.
 * The vehicle delete is by the ids gathered, so a vehicle moved in
 * meanwhile makes the organisation delete fail on its Restrict key (409)
 * rather than go without its files being collected.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const vehicles = await prisma.vehicle.findMany({ where: { organizationId: params.orgId }, select: { id: true, ownerId: true } })
  if (vehicles.length > 0) {
    const parsed = await readJsonBody(req)
    const confirmName = parsed.ok && typeof parsed.body.confirmName === 'string' ? parsed.body.confirmName.trim() : ''
    if (confirmName !== loaded.membership.organization.name.trim()) {
      return await apiErrorWith('orgDeleteConfirm', { count: vehicles.length }, 400)
    }
  }

  try {
    const keys = (await Promise.all(vehicles.map((v) => collectStorageKeys(v.ownerId, v.id)))).flat()
    await prisma.$transaction([
      prisma.vehicle.deleteMany({ where: { id: { in: vehicles.map((v) => v.id) }, organizationId: params.orgId } }),
      prisma.organization.delete({ where: { id: params.orgId } }),
    ])
    await deleteStoredFiles(keys)
    return NextResponse.json({ ok: true, vehiclesDeleted: vehicles.length, filesDeleted: keys.length })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return await apiErrorWith('orgHasVehicles', { count: vehicles.length + 1 }, 409)
    }
    return await apiError('internalError', 500)
  }
}
