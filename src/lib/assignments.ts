import type { Prisma } from '@prisma/client'

/**
 * RL-040: driver assignments. One active per vehicle is a partial unique
 * index in the database; this module holds the rest.
 */

export const ASSIGNMENT_NOTE_MAX = 300

/**
 * Ends a user's active assignments on an organisation's vehicles — when
 * they stop being a DRIVER there (removed, or given another role) or the
 * vehicle leaves it. Otherwise the row would stay "active", granting
 * nothing yet blocking the next driver by the one-active index.
 */
export function endAssignmentsFor(
  tx: Prisma.TransactionClient,
  where: { organizationId: string; driverUserId?: string; vehicleId?: string },
  now: Date = new Date()
) {
  return tx.vehicleAssignment.updateMany({
    where: {
      endedAt: null,
      ...(where.driverUserId ? { driverUserId: where.driverUserId } : {}),
      ...(where.vehicleId ? { vehicleId: where.vehicleId } : {}),
      vehicle: { organizationId: where.organizationId },
    },
    data: { endedAt: now },
  })
}
