import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { NOTE_MAX_LENGTH, checkReading, currentReading, isOverrideReason, parseKm, startOfDayUtc } from '@/lib/odometer'
import { conflictResponse, futureResponse, isFutureDay, loadReadings } from '@/lib/odometerRecords'

/**
 * RL-044: a vehicle's odometer history. Owner and active collaborators
 * alike — a mechanic reading the dash is exactly who should be able to
 * write it down. No rate limit rule, like every other private garage
 * write (tasks, documents): it touches one vehicle the caller already
 * passed requireVehicleAccess() for.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const vehicle = await requireVehicleAccess(params.id, auth.session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const readings = await prisma.odometerReading.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ readAt: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ current: currentReading(readings), readings })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const km = parseKm(body.km)
  if (!km.ok || km.km === null) return await apiError('odometerKmInvalid', 400)

  const readAt = body.readAt === undefined ? new Date() : new Date(String(body.readAt))
  if (Number.isNaN(readAt.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(readAt)) return await futureResponse()

  // An override is only ever an explicit choice, with a reason.
  const overrideReason = body.overrideReason ?? null
  if (overrideReason !== null && !isOverrideReason(overrideReason)) return await apiError('odometerOverrideInvalid', 400)

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, NOTE_MAX_LENGTH) || null : null

  try {
    const day = startOfDayUtc(readAt)
    const check = checkReading(await loadReadings(vehicle.id), { km: km.km, readAt: day, isOverride: overrideReason !== null })
    if (!check.ok) return await conflictResponse(check, km.km)

    const reading = await prisma.odometerReading.create({
      data: {
        vehicleId: vehicle.id,
        km: km.km,
        readAt: day,
        source: 'MANUAL',
        note,
        isOverride: overrideReason !== null,
        overrideReason,
        createdByUserId: session.user.id,
      },
    })
    return NextResponse.json(reading, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
