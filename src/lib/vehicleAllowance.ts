import type { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { apiError, apiErrorWith } from './apiError'
import { LADDER, overLimitIds, PLAN_SELECT, vehicleLimit } from './plans'

/**
 * RL-042 (#54): whether this account has room for one more **personal**
 * vehicle — a 403 naming its allowance if not, else null. Company vehicles
 * never count; they are the organisation's.
 *
 * Both ways a personal vehicle appears go through here — creating one, and
 * moving one out of an organisation — so the two cannot apply different
 * allowances.
 */
export async function refuseOverVehicleLimit(userId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PLAN_SELECT })
  const limit = vehicleLimit(user)
  if (limit === null) return null
  const personal = await prisma.vehicle.count({ where: { ownerId: userId, organizationId: null } })
  if (personal < limit) return null
  return limit === LADDER.FREE.vehicles
    ? apiErrorWith('vehicleLimit', { limit, personal: LADDER.PERSONAL.vehicles }, 403, { code: 'UPGRADE_REQUIRED' })
    : apiErrorWith('vehicleLimitPersonal', { limit }, 403, { code: 'UPGRADE_REQUIRED' })
}

/**
 * The owner's personal vehicles that are over the allowance of the plan
 * they hold now — read-only (see `overLimitIds()`). Empty for an account
 * within it, and for a grandfathered one. Company vehicles are never here.
 */
export async function readOnlyVehicleIds(ownerId: string): Promise<Set<string>> {
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: PLAN_SELECT })
  const limit = vehicleLimit(user)
  if (limit === null) return new Set()
  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId, organizationId: null },
    select: { id: true, createdAt: true },
  })
  return new Set(overLimitIds(vehicles, limit))
}

/** Whether this vehicle is read-only because its owner's plan no longer covers it. */
export async function isVehicleReadOnly(vehicle: { id: string; ownerId: string; organizationId: string | null }): Promise<boolean> {
  if (vehicle.organizationId) return false
  return (await readOnlyVehicleIds(vehicle.ownerId)).has(vehicle.id)
}

/**
 * The gate every write under `/api/vehicles/[id]` passes after its access
 * check: a 403 for a vehicle that is over its owner's allowance, else
 * null. It applies to whoever is writing — a collaborator too — because
 * it is the vehicle that is read-only, not the person. Reading, exporting,
 * deleting the vehicle, moving it into an organisation, making it private
 * and withdrawing a passport link stay open (`readOnly.test.ts` holds the
 * list), since those are the ways out.
 */
export async function refuseIfReadOnly(vehicle: { id: string; ownerId: string; organizationId: string | null }): Promise<NextResponse | null> {
  if (!(await isVehicleReadOnly(vehicle))) return null
  return apiError('vehicleReadOnly', 403, { code: 'UPGRADE_REQUIRED' })
}
