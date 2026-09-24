import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseKm, startOfDayUtc } from '@/lib/odometer'
import { ReadingConflict, conflictResponse, futureResponse, isFutureDay } from '@/lib/odometerRecords'
import { parseTripText } from '@/lib/trips'
import { TRIP_SELECT, toLoadedTrip, tripGate, writeTripReadings } from '@/lib/tripRecords'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-051: log a trip — the day, from → to, what for, business or personal,
 * and the km at each end. The two km are OdometerReadings (source TRIP)
 * written in the same transaction and checked against the history like any
 * other reading, so a km that breaks it refuses the trip.
 *
 * A driver logs their own trips only. A manager can log one for a member
 * of the organisation (a driver who handed in a paper sheet); on a
 * personal vehicle the driver is the owner.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly
  const gate = await tripGate(vehicle)
  if (gate === 'forbidden') return await apiError('notFound', 404)
  if (gate === 'upgrade') return await apiError('proTrips', 403, { code: 'UPGRADE_REQUIRED' })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const text = parseTripText(body)
  if (!text.ok) return await apiErrorWith('tripFieldInvalid', { field: text.field }, 400)
  const startKm = parseKm(body.startKm)
  const endKm = parseKm(body.endKm)
  if (!startKm.ok || !endKm.ok || startKm.km === null || endKm.km === null) return await apiError('odometerKmInvalid', 400)
  if (endKm.km < startKm.km) return await apiError('tripKmBackwards', 400)

  const date = new Date(String(body.date ?? ''))
  if (Number.isNaN(date.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(date)) return await futureResponse()
  const day = startOfDayUtc(date)

  // Who drove it. A driver is always themselves, whatever the body says.
  const wanted = vehicle.access === 'owner' && typeof body.driverUserId === 'string' && body.driverUserId ? body.driverUserId : session.user.id
  if (wanted !== session.user.id) {
    const member = vehicle.organizationId
      ? await prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: vehicle.organizationId, userId: wanted } },
          select: { userId: true },
        })
      : null
    if (!member) return await apiError('tripDriverInvalid', 400)
  }
  const driver = await prisma.user.findUnique({ where: { id: wanted }, select: { id: true, displayName: true } })
  if (!driver) return await apiError('tripDriverInvalid', 400)

  try {
    const trip = await prisma.$transaction(async (tx) => {
      const readings = await writeTripReadings(tx, { vehicleId: vehicle.id, day, startKm: startKm.km!, endKm: endKm.km!, userId: session.user.id })
      return tx.trip.create({
        data: {
          vehicleId: vehicle.id,
          driverUserId: driver.id,
          driverName: driver.displayName,
          date: day,
          ...text.data,
          ...readings,
          createdByUserId: session.user.id,
        },
        select: TRIP_SELECT,
      })
    })
    return NextResponse.json(toLoadedTrip(trip), { status: 201 })
  } catch (e) {
    if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
    return await apiError('internalError', 500)
  }
}
