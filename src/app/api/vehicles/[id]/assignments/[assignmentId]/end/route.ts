import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'
import { parseKm } from '@/lib/odometer'
import { ReadingConflict, conflictResponse } from '@/lib/odometerRecords'
import { writeHandoverReading } from '@/lib/assignmentRecords'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

class AlreadyEnded extends Error {}

/**
 * RL-040: ends an assignment, now — a manager of the vehicle, or the driver
 * handing it back. The handover's km (the driver's form asks for it; a
 * manager ending one from the office may not know it) goes into the
 * mileage history in the same transaction, and the end is conditional on
 * the assignment still being active: ending twice records nothing twice.
 * Condition photos are uploaded before ending, while the driver still has
 * access to the vehicle.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const assignment = await prisma.vehicleAssignment.findUnique({ where: { id: params.assignmentId } })
  if (!assignment || assignment.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && assignment.driverUserId !== session.user.id) return await apiError('notFound', 404)

  // A body is optional: ending without a km is allowed.
  const parsed = await readJsonBody(req)
  const km = parseKm(parsed.ok ? parsed.body.km : undefined)
  if (!km.ok) return await apiError('odometerKmInvalid', 400)

  try {
    await prisma.$transaction(async (tx) => {
      const endReadingId =
        km.km !== null ? await writeHandoverReading(tx, { vehicleId: vehicle.id, km: km.km, userId: session.user.id }) : null
      const ended = await tx.vehicleAssignment.updateMany({
        where: { id: assignment.id, endedAt: null },
        data: { endedAt: new Date(), endReadingId },
      })
      // Rolls the reading back with it.
      if (ended.count === 0) throw new AlreadyEnded()
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AlreadyEnded) return await apiError('assignmentAlreadyEnded', 400)
    if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
    return await apiError('internalError', 500)
  }
}
