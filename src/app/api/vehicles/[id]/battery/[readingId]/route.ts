import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'
import { readJsonBody } from '@/lib/requestBody'
import { parseBatteryReadingInput } from '@/lib/batteryHealth'
import { startOfDayUtc } from '@/lib/odometer'
import { futureResponse, isFutureDay } from '@/lib/odometerRecords'

/**
 * Correcting a battery reading — a typo in the figure, the wrong source, a
 * report entered with the wrong day. The whole reading is sent and checked
 * like a new one. Owner: any; anyone else: their own. Its km was never an
 * odometer reading, so there is no history to re-check. `createdAt` stays:
 * the passport shows when a reading was first entered.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; readingId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const reading = await prisma.batteryHealthReading.findUnique({ where: { id: params.readingId } })
  if (!reading || reading.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && reading.createdByUserId !== session.user.id) {
    return await apiError('batteryOwnOnly', 403)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const input = parseBatteryReadingInput(parsed.body)
  if (!input.ok) return await apiError(input.code, 400)
  const date = parsed.body.date === undefined ? reading.date : new Date(String(parsed.body.date))
  if (Number.isNaN(date.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(date)) return await futureResponse()

  try {
    const updated = await prisma.batteryHealthReading.update({
      where: { id: reading.id },
      data: { ...input.value, date: startOfDayUtc(date) },
    })
    return NextResponse.json(updated)
  } catch {
    return await apiError('internalError', 500)
  }
}

/**
 * Removing a battery reading. Owner: any; anyone else: their own (pitfall
 * #4). Its report file goes after the row, best effort.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; readingId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const reading = await prisma.batteryHealthReading.findUnique({ where: { id: params.readingId } })
  if (!reading || reading.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && reading.createdByUserId !== session.user.id) {
    return await apiError('batteryOwnOnly', 403)
  }

  try {
    await prisma.batteryHealthReading.delete({ where: { id: reading.id } })
  } catch {
    return await apiError('internalError', 500)
  }
  if (reading.reportUrl) {
    await deleteUpload(reading.reportUrl).catch((e) => console.error('[battery] report file not removed', e))
  }
  return NextResponse.json({ ok: true })
}
