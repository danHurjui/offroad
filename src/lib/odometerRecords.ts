import type { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { apiError, apiErrorWith } from './apiError'
import { checkReading, dayKey, startOfDayUtc, type ReadingCheck } from './odometer'

/**
 * The database half of src/lib/odometer.ts: loading a vehicle's history,
 * and turning a refused reading into a response that names the reading it
 * collided with — "lower than the 146,230 km recorded on 12.09.2026" is
 * something a person can act on; "invalid" is not.
 */

const READING_FIELDS = { id: true, km: true, readAt: true, isOverride: true, createdAt: true } as const

export function loadReadings(vehicleId: string, client: Prisma.TransactionClient = prisma) {
  return client.odometerReading.findMany({ where: { vehicleId }, select: READING_FIELDS })
}

export async function conflictResponse(check: Extract<ReadingCheck, { ok: false }>, km: number): Promise<NextResponse> {
  const values = {
    km: km.toLocaleString('ro-RO'),
    conflictKm: check.conflict.km.toLocaleString('ro-RO'),
    date: check.conflict.readAt.toLocaleDateString('ro-RO', { timeZone: 'UTC' }),
  }
  const key = check.kind === 'belowEarlier' ? 'odometerBelowEarlier' : 'odometerAboveLater'
  return apiErrorWith(key, values, 409, {
    conflict: { id: check.conflict.id, km: check.conflict.km, readAt: dayKey(check.conflict.readAt) },
  })
}

/** A reading dated after today is a prediction, not a reading. */
export function isFutureDay(date: Date, now: Date = new Date()): boolean {
  return dayKey(date) > dayKey(now)
}

export const futureResponse = () => apiError('odometerFuture', 400)

/**
 * Keeps the reading logged with a job in step with the job.
 *
 * `km` null removes it. Otherwise it is created or moved to the job's
 * date, and checked against the rest of the history first — the caller
 * gets the refusal back and writes nothing. Runs inside the caller's
 * transaction so a task never saves with half of its km.
 */
export async function syncTaskReading(
  tx: Prisma.TransactionClient,
  args: { vehicleId: string; taskId: string; km: number | null; date: Date; userId: string }
): Promise<ReadingCheck> {
  const existing = await tx.odometerReading.findUnique({ where: { taskId: args.taskId } })
  if (args.km === null) {
    if (existing) await tx.odometerReading.delete({ where: { id: existing.id } })
    return { ok: true }
  }
  const readAt = startOfDayUtc(args.date)
  const check = checkReading(await loadReadings(args.vehicleId, tx), { km: args.km, readAt, isOverride: false }, existing?.id)
  if (!check.ok) return check
  if (existing) {
    await tx.odometerReading.update({ where: { id: existing.id }, data: { km: args.km, readAt } })
  } else {
    await tx.odometerReading.create({
      data: { vehicleId: args.vehicleId, taskId: args.taskId, km: args.km, readAt, source: 'TASK', createdByUserId: args.userId },
    })
  }
  return { ok: true }
}

/** Thrown inside a transaction to roll it back and carry the refusal out. */
export class ReadingConflict extends Error {
  constructor(readonly check: Extract<ReadingCheck, { ok: false }>, readonly km: number) {
    super('odometer reading conflicts with history')
  }
}

/**
 * The restoration intake's odometer is the vehicle's first reading
 * (backfilled by the migration for intakes that predate the history).
 * It is written without the date-order check: it is the recorded starting
 * point of the project, and refusing to save the intake over a later
 * reading would lose the intake, not fix the history. The history page
 * shows it with its source, so a disagreement is visible.
 */
export async function syncFoundStateReading(args: {
  vehicleId: string
  km: number | null
  acquisitionDate: Date
  userId: string
}): Promise<void> {
  const existing = await prisma.odometerReading.findFirst({
    where: { vehicleId: args.vehicleId, source: 'FOUND_STATE' },
    select: { id: true },
  })
  if (args.km === null || !Number.isInteger(args.km)) {
    if (existing) await prisma.odometerReading.delete({ where: { id: existing.id } })
    return
  }
  const readAt = startOfDayUtc(args.acquisitionDate)
  if (existing) {
    await prisma.odometerReading.update({ where: { id: existing.id }, data: { km: args.km, readAt } })
  } else {
    await prisma.odometerReading.create({
      data: { vehicleId: args.vehicleId, km: args.km, readAt, source: 'FOUND_STATE', createdByUserId: args.userId },
    })
  }
}
