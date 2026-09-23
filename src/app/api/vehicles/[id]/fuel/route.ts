import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { LITRES_MAX, STATION_MAX_LENGTH, TOTAL_RON_MAX, parsePositiveAmount } from '@/lib/fuel'
import { parseKm, startOfDayUtc } from '@/lib/odometer'
import { ReadingConflict, conflictResponse, futureResponse, isFutureDay, loadReadings } from '@/lib/odometerRecords'
import { checkReading } from '@/lib/odometer'
import { serializeFuelEntry } from '@/lib/serialize'

/**
 * RL-044: record a fill-up. Three numbers — lei, litres, km — with a full
 * tank the default, because that is the common case and the one
 * consumption needs. Owner and active collaborators, like odometer
 * readings; no rate limit rule, like every private garage write.
 *
 * The km becomes an OdometerReading (source FUEL) in the same
 * transaction, checked against the history like any other reading: a
 * refused km refuses the fill-up, so it is never saved half-recorded.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const litres = parsePositiveAmount(body.litres, LITRES_MAX)
  if (!litres.ok) return await apiError('fuelLitresInvalid', 400)
  const total = parsePositiveAmount(body.totalRon, TOTAL_RON_MAX)
  if (!total.ok) return await apiError('fuelTotalInvalid', 400)
  const km = parseKm(body.km)
  if (!km.ok) return await apiError('odometerKmInvalid', 400)

  const date = body.date === undefined ? new Date() : new Date(String(body.date))
  if (Number.isNaN(date.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(date)) return await futureResponse()
  const day = startOfDayUtc(date)

  const station = typeof body.station === 'string' ? body.station.trim().slice(0, STATION_MAX_LENGTH) || null : null
  const isFullTank = body.isFullTank === undefined ? true : Boolean(body.isFullTank)

  try {
    const entry = await prisma.$transaction(async (tx) => {
      let odometerReadingId: string | null = null
      if (km.km !== null) {
        const check = checkReading(await loadReadings(vehicle.id, tx), { km: km.km, readAt: day, isOverride: false })
        if (!check.ok) throw new ReadingConflict(check, km.km)
        const reading = await tx.odometerReading.create({
          data: { vehicleId: vehicle.id, km: km.km, readAt: day, source: 'FUEL', createdByUserId: session.user.id },
        })
        odometerReadingId = reading.id
      }
      return tx.fuelEntry.create({
        data: {
          vehicleId: vehicle.id,
          date: day,
          litres: litres.value,
          totalRon: total.value,
          isFullTank,
          station,
          odometerReadingId,
          createdByUserId: session.user.id,
        },
        include: { odometerReading: { select: { km: true } } },
      })
    })
    return NextResponse.json(serializeFuelEntry(entry), { status: 201 })
  } catch (e) {
    if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
    return await apiError('internalError', 500)
  }
}
