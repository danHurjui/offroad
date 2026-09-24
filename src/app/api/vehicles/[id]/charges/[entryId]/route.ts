import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'
import { hidesCosts } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'
import { parseChargeInput } from '@/lib/charging'
import { checkReading, parseKm, startOfDayUtc } from '@/lib/odometer'
import { ReadingConflict, conflictResponse, futureResponse, isFutureDay, loadReadings } from '@/lib/odometerRecords'
import { serializeChargeEntry, toNumberOrNull } from '@/lib/serialize'

/**
 * Correcting a charge. Owner: any; anyone else: their own. The whole
 * charge is sent and parsed like a new one, and its km follows it the way
 * a job's does: the linked `OdometerReading` (source CHARGE) is moved to
 * the new day and km, created, or removed with a blank km — in the same
 * transaction, checked against the history, so a km that breaks it
 * refuses the correction (409 naming the reading).
 *
 * Someone who does not see costs sends no total; theirs is then **kept**
 * as stored, never re-priced — an edit form that starts blank must not
 * wipe an amount its user was never shown. A home charge left without a
 * total by someone who does see costs is priced from today's tariff, as a
 * new one would be, and labelled so.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const entry = await prisma.chargeEntry.findUnique({ where: { id: params.entryId } })
  if (!entry || entry.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && entry.createdByUserId !== session.user.id) {
    return await apiError('chargeOwnOnly', 403)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body
  const hidden = hidesCosts(vehicle)
  const keepTotal = hidden && (body.totalRon === undefined || body.totalRon === null || body.totalRon === '')
  const input = parseChargeInput(
    keepTotal ? { ...body, totalRon: toNumberOrNull(entry.totalRon) ?? 0 } : body,
    toNumberOrNull(vehicle.homeTariffRonPerKwh)
  )
  if (!input.ok) return await apiError(input.code, 400)
  const value = keepTotal ? { ...input.value, totalFromTariff: entry.totalFromTariff } : input.value
  const km = parseKm(body.km)
  if (!km.ok) return await apiError('odometerKmInvalid', 400)

  const date = body.date === undefined ? entry.date : new Date(String(body.date))
  if (Number.isNaN(date.getTime())) return await apiError('invalidDate', 400)
  if (isFutureDay(date)) return await futureResponse()
  const day = startOfDayUtc(date)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      let odometerReadingId = entry.odometerReadingId
      if (km.km === null) {
        if (odometerReadingId) await tx.odometerReading.deleteMany({ where: { id: odometerReadingId, source: 'CHARGE' } })
        odometerReadingId = null
      } else {
        const check = checkReading(await loadReadings(vehicle.id, tx), { km: km.km, readAt: day, isOverride: false }, odometerReadingId ?? undefined)
        if (!check.ok) throw new ReadingConflict(check, km.km)
        if (odometerReadingId) {
          await tx.odometerReading.update({ where: { id: odometerReadingId }, data: { km: km.km, readAt: day } })
        } else {
          const reading = await tx.odometerReading.create({
            data: { vehicleId: vehicle.id, km: km.km, readAt: day, source: 'CHARGE', createdByUserId: session.user.id },
          })
          odometerReadingId = reading.id
        }
      }
      return tx.chargeEntry.update({
        where: { id: entry.id },
        data: { date: day, ...value, odometerReadingId },
        include: { odometerReading: { select: { km: true } } },
      })
    })
    const shown = serializeChargeEntry(updated)
    return NextResponse.json(hidden ? { ...shown, totalRon: null, pricePerKwh: null } : shown)
  } catch (e) {
    if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
    return await apiError('internalError', 500)
  }
}

/**
 * Removing a charge. Owner: any; anyone else: their own (pitfall #4). It
 * takes the odometer reading it created and its receipt file with it,
 * exactly like a fill-up; the file goes after the rows, best effort.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const entry = await prisma.chargeEntry.findUnique({ where: { id: params.entryId } })
  if (!entry || entry.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && entry.createdByUserId !== session.user.id) {
    return await apiError('chargeOwnOnly', 403)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.chargeEntry.delete({ where: { id: entry.id } })
      if (entry.odometerReadingId) {
        await tx.odometerReading.deleteMany({ where: { id: entry.odometerReadingId, source: 'CHARGE' } })
      }
    })
  } catch {
    return await apiError('internalError', 500)
  }
  if (entry.receiptUrl) {
    await deleteUpload(entry.receiptUrl).catch((e) => console.error('[charge] receipt file not removed', e))
  }
  return NextResponse.json({ ok: true })
}
