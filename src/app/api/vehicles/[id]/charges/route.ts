import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseChargeInput } from '@/lib/charging'
import { checkReading, parseKm, startOfDayUtc } from '@/lib/odometer'
import { ReadingConflict, conflictResponse, futureResponse, isFutureDay, loadReadings } from '@/lib/odometerRecords'
import { serializeChargeEntry, toNumberOrNull } from '@/lib/serialize'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-053 (#121): record a charge. The fill-up's rules (fuel/route.ts) —
 * owner, active collaborators and the assigned driver; the km becomes an
 * OdometerReading (source CHARGE) in the same transaction, so a km that
 * breaks the history refuses the charge — plus the charging log's own
 * (charging.ts): the total may be 0, kWh may be missing, and a home charge
 * with kWh can take its total from the owner's home tariff.
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
  const body = parsed.body

  const input = parseChargeInput(body, toNumberOrNull(vehicle.homeTariffRonPerKwh))
  if (!input.ok) return await apiError(input.code, 400)
  const km = parseKm(body.km)
  if (!km.ok) return await apiError('odometerKmInvalid', 400)

  const date = body.date === undefined ? new Date() : new Date(String(body.date))
  if (Number.isNaN(date.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(date)) return await futureResponse()
  const day = startOfDayUtc(date)

  try {
    const entry = await prisma.$transaction(async (tx) => {
      let odometerReadingId: string | null = null
      if (km.km !== null) {
        const check = checkReading(await loadReadings(vehicle.id, tx), { km: km.km, readAt: day, isOverride: false })
        if (!check.ok) throw new ReadingConflict(check, km.km)
        const reading = await tx.odometerReading.create({
          data: { vehicleId: vehicle.id, km: km.km, readAt: day, source: 'CHARGE', createdByUserId: session.user.id },
        })
        odometerReadingId = reading.id
      }
      return tx.chargeEntry.create({
        data: { vehicleId: vehicle.id, date: day, ...input.value, odometerReadingId, createdByUserId: session.user.id },
        include: { odometerReading: { select: { km: true } } },
      })
    })
    const shown = serializeChargeEntry(entry)
    return NextResponse.json(hidesCosts(vehicle) ? { ...shown, totalRon: null, pricePerKwh: null } : shown, { status: 201 })
  } catch (e) {
    if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
    return await apiError('internalError', 500)
  }
}
