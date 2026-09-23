import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { accessForRole, requireVehicleOwner } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'

/**
 * RL-038: move a personal vehicle into an organisation. Only its owner, and
 * only into an organisation where they are OWNER or FLEET_MANAGER — the
 * roles that get owner access to company vehicles, so nobody moves a car
 * somewhere they could not then manage it.
 *
 * From then on membership decides who may see and change it
 * (src/lib/access.ts); the mover stays its account of record, which grants
 * nothing by itself. It stops being public in the same write, since a
 * company vehicle never is. Moving a vehicle back out is not built.
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
