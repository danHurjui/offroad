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

class NotOpen extends Error {}

/**
 * RL-040 handover, the taking end: the km when the driver takes the
 * vehicle, for an assignment made without one (a manager assigning from
 * the office). Once only — the start is on the record after that — and
 * only while the assignment is active. The driver or a manager.
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

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const km = parseKm(parsed.body.km)
  if (!km.ok || km.km === null) return await apiError('odometerKmInvalid', 400)
  const value = km.km

  try {
    await prisma.$transaction(async (tx) => {
      const startReadingId = await writeHandoverReading(tx, { vehicleId: vehicle.id, km: value, userId: session.user.id })
      const set = await tx.vehicleAssignment.updateMany({
        where: { id: assignment.id, endedAt: null, startReadingId: null },
        data: { startReadingId },
      })
      if (set.count === 0) throw new NotOpen()
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof NotOpen) return await apiError('handoverStartRecorded', 400)
    if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
    return await apiError('internalError', 500)
  }
}
