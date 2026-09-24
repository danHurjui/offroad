import type { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { apiError, apiErrorWith } from './apiError'
import { LADDER, ORG_PLAN_SELECT, orgVehicleLimit, overLimitIds, PLAN_SELECT, vehicleLimit } from './plans'

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
    select: { id: true, createdAt: true, keptEditableAt: true },
  })
  return new Set(overLimitIds(vehicles, limit))
}

/**
 * RL-042 slice 3: an organisation's vehicles over its plan's allowance —
 * read-only, never hidden. A lapsed plan leaves the organisation an
 * allowance of none, so every vehicle stays readable (compliance dates,
 * documents, history) and nothing can be changed until it pays again.
 * Empty for a comped organisation.
 */
export async function orgReadOnlyVehicleIds(organizationId: string): Promise<Set<string>> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: ORG_PLAN_SELECT })
  const limit = orgVehicleLimit(org)
  if (limit === null) return new Set()
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true, createdAt: true, keptEditableAt: true },
  })
  return new Set(overLimitIds(vehicles, limit))
}

/** Whether this vehicle is read-only because the plan behind it — its owner's, or its organisation's — no longer covers it. */
export async function isVehicleReadOnly(vehicle: { id: string; ownerId: string; organizationId: string | null }): Promise<boolean> {
  if (vehicle.organizationId) return (await orgReadOnlyVehicleIds(vehicle.organizationId)).has(vehicle.id)
  return (await readOnlyVehicleIds(vehicle.ownerId)).has(vehicle.id)
}

/**
 * The gate every write under `/api/vehicles/[id]` passes after its access
 * check: a 403 for a vehicle that is over its allowance, else null. It
 * applies to whoever is writing — a collaborator or a driver too —
 * because it is the vehicle that is read-only, not the person. Reading,
 * exporting, deleting the vehicle, moving it into or out of an
 * organisation, making it private and withdrawing a passport link stay
 * open (`readOnly.test.ts` holds the list), since those are the ways out.
 */
export async function refuseIfReadOnly(vehicle: { id: string; ownerId: string; organizationId: string | null }): Promise<NextResponse | null> {
  if (!(await isVehicleReadOnly(vehicle))) return null
  return vehicle.organizationId
    ? apiError('orgVehicleReadOnly', 403, { code: 'ORG_PLAN_REQUIRED' })
    : apiError('vehicleReadOnly', 403, { code: 'UPGRADE_REQUIRED' })
}

/**
 * Whether an organisation has room for one more vehicle — a 403 naming its
 * allowance if not, else null. Moving a vehicle in is the only way one
 * arrives, so this is checked there.
 */
export async function refuseOverOrgVehicleLimit(organizationId: string): Promise<NextResponse | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: ORG_PLAN_SELECT })
  const limit = orgVehicleLimit(org)
  if (limit === null) return null
  if (limit === 0) return apiError('orgPlanRequired', 403, { code: 'ORG_PLAN_REQUIRED' })
  const held = await prisma.vehicle.count({ where: { organizationId } })
  if (held < limit) return null
  return apiErrorWith('orgVehicleLimit', { limit }, 403, { code: 'ORG_PLAN_REQUIRED' })
}

/**
 * RL-042: records which vehicles stay editable when there are more than
 * the plan covers — a personal garage (`{ ownerId, organizationId: null }`)
 * or an organisation's fleet (`{ organizationId }`). The rest of the scope
 * loses its mark in the same transaction, so the choice is always exactly
 * the list sent. The caller has checked the ids and the count.
 */
export async function chooseEditableVehicles(
  scope: { ownerId: string; organizationId: null } | { organizationId: string },
  ids: string[]
): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.vehicle.updateMany({ where: { ...scope, id: { notIn: ids } }, data: { keptEditableAt: null } }),
    prisma.vehicle.updateMany({ where: { ...scope, id: { in: ids }, keptEditableAt: null }, data: { keptEditableAt: now } }),
  ])
}

/**
 * The `vehicleIds` of a choice: distinct strings, each one of `allowed`,
 * at most `max` of them (null is no cap). Null when the body is not that.
 */
export function parseEditableChoice(body: Record<string, unknown>, allowed: Set<string>, max: number | null): string[] | 'tooMany' | null {
  const raw = body.vehicleIds
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) return null
  const ids = Array.from(new Set(raw as string[]))
  if (!ids.every((id) => allowed.has(id))) return null
  if (max !== null && ids.length > max) return 'tooMany'
  return ids
}
