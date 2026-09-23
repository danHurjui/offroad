import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'

/**
 * Removing a reading. The owner may remove any; a collaborator only the
 * ones they wrote — the same rule as tasks (pitfall #4), and it falls the
 * safe way for a reading whose writer's account is gone (null).
 *
 * Deleting never needs a history check: taking a point out of an ordered
 * sequence cannot put the rest out of order.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; readingId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const reading = await prisma.odometerReading.findUnique({ where: { id: params.readingId } })
  if (!reading || reading.vehicleId !== vehicle.id) return await apiError('notFound', 404)

  const isOwner = vehicle.access === 'owner'
  if (!isOwner && reading.createdByUserId !== session.user.id) {
    return await apiError('odometerDeleteOwnOnly', 403)
  }

  try {
    await prisma.odometerReading.delete({ where: { id: reading.id } })
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
