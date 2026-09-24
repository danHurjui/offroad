import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { vehicleHasPro } from './entitlement'
import { checkReading } from './odometer'
import { loadReadings, ReadingConflict } from './odometerRecords'
import type { AccessibleVehicle } from './access'
import type { Month, TripLike } from './trips'

/**
 * The database half of src/lib/trips.ts (RL-051).
 *
 * Who may use the trip sheet on a vehicle:
 * - a **company vehicle**: its managers (`owner` access) and its assigned
 *   driver (`driver` access) — organisations are the closed beta that
 *   stands in for the Business tier (#54);
 * - a **personal vehicle**: its owner, when the account of record has Pro;
 * - never a collaborator (a mechanic has no business with where the car
 *   went). A driver sees and exports only their own trips.
 */
export type TripGate = 'ok' | 'upgrade' | 'forbidden'

export async function tripGate(vehicle: Pick<AccessibleVehicle, 'access' | 'organizationId' | 'ownerId'>): Promise<TripGate> {
  if (vehicle.access !== 'owner' && vehicle.access !== 'driver') return 'forbidden'
  if (vehicle.organizationId) return 'ok'
  return (await vehicleHasPro(vehicle)) ? 'ok' : 'upgrade'
}

export const TRIP_SELECT = {
  id: true,
  vehicleId: true,
  driverUserId: true,
  driverName: true,
  date: true,
  fromPlace: true,
  toPlace: true,
  purpose: true,
  kind: true,
  createdByUserId: true,
  createdAt: true,
  startReading: { select: { km: true } },
  endReading: { select: { km: true } },
} as const

type TripRow = Prisma.TripGetPayload<{ select: typeof TRIP_SELECT }>

export interface LoadedTrip extends TripLike {
  vehicleId: string
  driverUserId: string | null
  driverName: string
  fromPlace: string
  toPlace: string
  purpose: string | null
  createdByUserId: string | null
}

export function toLoadedTrip(row: TripRow): LoadedTrip {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    driverUserId: row.driverUserId,
    driverName: row.driverName,
    date: row.date,
    fromPlace: row.fromPlace,
    toPlace: row.toPlace,
    purpose: row.purpose,
    kind: row.kind,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    startKm: row.startReading?.km ?? null,
    endKm: row.endReading?.km ?? null,
  }
}

/** A month's trips, for the vehicles given, optionally only one driver's. */
export async function loadMonthTrips(where: { vehicleIds: string[]; month: Month; driverUserId?: string }): Promise<LoadedTrip[]> {
  if (where.vehicleIds.length === 0) return []
  const rows = await prisma.trip.findMany({
    where: {
      vehicleId: { in: where.vehicleIds },
      date: { gte: where.month.from, lt: where.month.end },
      ...(where.driverUserId ? { driverUserId: where.driverUserId } : {}),
    },
    select: TRIP_SELECT,
  })
  return rows.map(toLoadedTrip)
}

/**
 * Writes a trip's two ends into the mileage history, each checked like any
 * other reading, inside the caller's transaction. Throws `ReadingConflict`
 * on a refusal, which rolls the trip back with it.
 */
export async function writeTripReadings(
  tx: Prisma.TransactionClient,
  args: { vehicleId: string; day: Date; startKm: number; endKm: number; userId: string }
): Promise<{ startReadingId: string; endReadingId: string }> {
  const ids: string[] = []
  for (const km of [args.startKm, args.endKm]) {
    const check = checkReading(await loadReadings(args.vehicleId, tx), { km, readAt: args.day, isOverride: false })
    if (!check.ok) throw new ReadingConflict(check, km)
    const reading = await tx.odometerReading.create({
      data: { vehicleId: args.vehicleId, km, readAt: args.day, source: 'TRIP', createdByUserId: args.userId },
    })
    ids.push(reading.id)
  }
  return { startReadingId: ids[0], endReadingId: ids[1] }
}
