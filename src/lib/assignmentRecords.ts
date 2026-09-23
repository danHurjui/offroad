import type { Prisma } from '@prisma/client'
import { checkReading, startOfDayUtc } from './odometer'
import { ReadingConflict, loadReadings } from './odometerRecords'

/**
 * RL-040 handover: the km at one end of an assignment, written as an
 * OdometerReading (source HANDOVER) in the transaction that starts or ends
 * it — checked against the vehicle's history like any other reading, so a
 * km that breaks it refuses the handover rather than recording half of it.
 * Throws ReadingConflict for the route to turn into its 409.
 */
export async function writeHandoverReading(
  tx: Prisma.TransactionClient,
  args: { vehicleId: string; km: number; userId: string; now?: Date }
): Promise<string> {
  const day = startOfDayUtc(args.now ?? new Date())
  const check = checkReading(await loadReadings(args.vehicleId, tx), { km: args.km, readAt: day, isOverride: false })
  if (!check.ok) throw new ReadingConflict(check, args.km)
  const reading = await tx.odometerReading.create({
    data: { vehicleId: args.vehicleId, km: args.km, readAt: day, source: 'HANDOVER', createdByUserId: args.userId },
  })
  return reading.id
}
