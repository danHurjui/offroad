import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'

/**
 * RL-040: ends an assignment, now. A manager of the vehicle, or the driver
 * handing it back. Conditional on it still being active, so ending twice
 * changes nothing the second time.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const assignment = await prisma.vehicleAssignment.findUnique({ where: { id: params.assignmentId } })
  if (!assignment || assignment.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && assignment.driverUserId !== session.user.id) return await apiError('notFound', 404)

  const ended = await prisma.vehicleAssignment.updateMany({
    where: { id: assignment.id, endedAt: null },
    data: { endedAt: new Date() },
  })
  if (ended.count === 0) return await apiError('assignmentAlreadyEnded', 400)
  return NextResponse.json({ ok: true })
}
