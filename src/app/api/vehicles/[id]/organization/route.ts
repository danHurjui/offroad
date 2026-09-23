import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { accessForRole, requireVehicleOwner } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'
import { endAssignmentsFor } from '@/lib/assignments'
import { FREE_TIER, hasPro, PRO_SELECT } from '@/lib/pro'

/**
 * RL-038: move a personal vehicle into an organisation. Only its owner, and
 * only into an organisation where they are OWNER or FLEET_MANAGER — the
 * roles that get owner access to company vehicles, so nobody moves a car
 * somewhere they could not then manage it.
 *
 * From then on membership decides who may see and change it
 * (src/lib/access.ts); the mover stays its account of record, which grants
 * nothing by itself. It stops being public in the same write, since a
 * company vehicle never is. DELETE below moves one back out.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if (vehicle.organizationId) return await apiError('vehicleAlreadyCompany', 400)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const organizationId = typeof parsed.body.organizationId === 'string' ? parsed.body.organizationId : ''
  if (!organizationId) return await apiError('orgMoveNotAllowed', 403)

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    select: { role: true },
  })
  if (!membership || accessForRole(membership.role) !== 'owner') return await apiError('orgMoveNotAllowed', 403)

  try {
    // Conditional on still being personal, so two moves at once cannot
    // both land.
    const moved = await prisma.vehicle.updateMany({
      where: { id: vehicle.id, organizationId: null },
      data: { organizationId, isPublic: false },
    })
    if (moved.count === 0) return await apiError('vehicleAlreadyCompany', 400)
    return NextResponse.json({ ok: true, organizationId })
  } catch {
    return await apiError('internalError', 500)
  }
}

/**
 * RL-038 slice 4: move a company vehicle out, into the caller's own
 * garage — the way to keep a vehicle when an organisation winds down,
 * rather than deleting it with the organisation. An OWNER or
 * FLEET_MANAGER (owner access) only, and within their own free-tier limit,
 * since it becomes one of their personal vehicles.
 *
 * The caller becomes its owner; the organisation's members lose access at
 * once. The slug is cleared (it could collide with the caller's own and
 * is only for a public page). Its files keep their storage keys — the rows
 * carry them, whoever's prefix they sit under.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if (!vehicle.organizationId) return await apiError('vehicleNotCompany', 400)

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (!hasPro(user)) {
    const personal = await prisma.vehicle.count({ where: { ownerId: session.user.id, organizationId: null } })
    if (personal >= FREE_TIER.vehicles) {
      return await apiErrorWith('vehicleLimit', { limit: FREE_TIER.vehicles }, 403, { code: 'UPGRADE_REQUIRED' })
    }
  }

  try {
    // Conditional on still being in the same organisation. Its driver, if
    // any, stops driving it in the same transaction (RL-040).
    const organizationId = vehicle.organizationId
    const moved = await prisma.$transaction(async (tx) => {
      await endAssignmentsFor(tx, { organizationId, vehicleId: vehicle.id })
      return tx.vehicle.updateMany({
        where: { id: vehicle.id, organizationId },
        data: { organizationId: null, ownerId: session.user.id, slug: null },
      })
    })
    if (moved.count === 0) return await apiError('vehicleNotCompany', 400)
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
