import { prisma } from '@/lib/prisma'
import type { Vehicle } from '@prisma/client'

/**
 * Returns the vehicle if `userId` owns it or is an ACTIVE collaborator on
 * it, else null. Existence of the vehicle is not authorization — every
 * route taking a vehicleId must call this (see CLAUDE.md).
 *
 * Does NOT distinguish owner from collaborator — callers that need
 * owner-only behaviour (delete, vehicle settings, invites) must separately
 * check `vehicle.ownerId === userId`.
 */
export async function requireVehicleAccess(vehicleId: string, userId: string): Promise<Vehicle | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle) return null
  if (vehicle.ownerId === userId) return vehicle

  const collaborator = await prisma.projectCollaborator.findFirst({
    where: { vehicleId, collaboratorUserId: userId, status: 'ACTIVE' },
  })
  return collaborator ? vehicle : null
}

/** Returns the vehicle only if `userId` is the owner, else null. */
export async function requireVehicleOwner(vehicleId: string, userId: string): Promise<Vehicle | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle || vehicle.ownerId !== userId) return null
  return vehicle
}
