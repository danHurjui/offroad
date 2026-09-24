import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseBatteryReadingInput } from '@/lib/batteryHealth'
import { startOfDayUtc } from '@/lib/odometer'
import { futureResponse, isFutureDay } from '@/lib/odometerRecords'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-056 (#124): record a high-voltage battery state-of-health reading.
 * Anyone who can log a charge can record one (owner, active collaborators,
 * the assigned driver) — a workshop test is often handed to whoever took
 * the car in. The km is kept on the reading, never written as an
 * OdometerReading: a report entered later must not bound the history.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const input = parseBatteryReadingInput(parsed.body)
  if (!input.ok) return await apiError(input.code, 400)

  const date = parsed.body.date === undefined ? new Date() : new Date(String(parsed.body.date))
  if (Number.isNaN(date.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(date)) return await futureResponse()

  try {
    const reading = await prisma.batteryHealthReading.create({
      data: { vehicleId: vehicle.id, date: startOfDayUtc(date), ...input.value, createdByUserId: session.user.id },
    })
    return NextResponse.json(reading, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
