import { prisma } from '@/lib/prisma'
import type { OrgRole, Vehicle } from '@prisma/client'

/**
 * What the caller may do with a vehicle:
 * - `owner` — everything: settings, deleting, inviting, costs, exports.
 * - `collaborator` — read it and add (and change) their own entries.
 * - `driver` (RL-040) — a company DRIVER, only while assigned to it: what a
 *   collaborator can do, plus its documents, and **never its costs**.
 *
 * Anything owner-only checks `=== 'owner'`, so a third kind is refused
 * there by default. Anything about costs asks `hidesCosts()`.
 */
export type VehicleAccess = 'owner' | 'collaborator' | 'driver'

/** A vehicle as the access checks hand it back: with the caller's access. */
export type AccessibleVehicle = Vehicle & { access: VehicleAccess }

/** The organisation roles that manage its vehicles (`owner` access). */
export const MANAGING_ROLES: OrgRole[] = ['OWNER', 'FLEET_MANAGER']

/**
 * What a role in the vehicle's organisation grants on that vehicle. A
 * DRIVER's `driver` holds only while they are assigned to it — the callers
 * below check the assignment.
 */
export function accessForRole(role: OrgRole): VehicleAccess {
  if (MANAGING_ROLES.includes(role)) return 'owner'
  return role === 'DRIVER' ? 'driver' : 'collaborator'
}

/**
 * Whether costs are kept from the caller: always from a driver (RL-040),
 * from a collaborator when the owner switched on
 * `hideCostsFromCollaborators` (RL-031), never from the owner. Every page
 * and route that shows money asks this — nothing re-derives it.
 */
export function hidesCosts(vehicle: { access: VehicleAccess; hideCostsFromCollaborators: boolean }): boolean {
  if (vehicle.access === 'owner') return false
  return vehicle.access === 'driver' || vehicle.hideCostsFromCollaborators
}

/**
 * The people a vehicle's owner-facing mail goes to (document reminders,
 * price alerts): its owner, or for a company vehicle the organisation's
 * OWNERs and FLEET_MANAGERs — never the account of record by itself, who
 * may have left. Select with `managersSelect(...)` so both sides line up.
 */
export function managersSelect<S extends Record<string, unknown>>(user: S) {
  return {
    organizationId: true,
    owner: { select: user },
    organization: { select: { members: { where: { role: { in: MANAGING_ROLES } }, select: { user: { select: user } } } } },
  } as const
}

export function vehicleManagers<U>(vehicle: {
  organizationId: string | null
  owner: U
  organization: { members: Array<{ user: U }> } | null
}): U[] {
  if (!vehicle.organizationId) return [vehicle.owner]
  return vehicle.organization?.members.map((m) => m.user) ?? []
}

/**
 * The caller's access to a vehicle, or null.
 *
 * **A personal vehicle** (`organizationId` null): its owner is `owner`; an
 * ACTIVE collaborator is `collaborator`.
 *
 * **A company vehicle** (RL-038): membership of the organisation decides,
 * and `ownerId` — only the account of record — grants nothing. OWNER and
 * FLEET_MANAGER are `owner`; MECHANIC is `collaborator`; DRIVER is
 * `driver`, and only while assigned to this vehicle (RL-040). An
 * outside collaborator invited to the vehicle is still `collaborator`.
 * Membership is read here on every call, never from the session, so a
 * removed member is refused on their very next request.
 *
 * This is the only place that decides ownership. Nothing else may compare
 * `ownerId` with the person asking (vehicleAccess.test.ts reads the source
 * to hold that): read `vehicle.access` instead.
 */
export async function vehicleAccessFor(
  vehicle: Pick<Vehicle, 'id' | 'ownerId' | 'organizationId'>,
  userId: string,
  { ownerOnly = false }: { ownerOnly?: boolean } = {}
): Promise<VehicleAccess | null> {
  if (vehicle.organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: vehicle.organizationId, userId } },
      select: { role: true },
    })
    if (membership) {
      const access = accessForRole(membership.role)
      if (access !== 'driver') return access
      // A driver reaches only the vehicle they are driving now.
      if (!ownerOnly) {
        const assigned = await prisma.vehicleAssignment.findFirst({
          where: { vehicleId: vehicle.id, driverUserId: userId, endedAt: null },
          select: { id: true },
        })
        if (assigned) return 'driver'
      }
    }
  } else if (vehicle.ownerId === userId) {
    return 'owner'
  }

  // A collaborator row never grants owner access, so an owner-only check
  // need not look for one.
  if (ownerOnly) return null
  const collaborator = await prisma.projectCollaborator.findFirst({
    where: { vehicleId: vehicle.id, collaboratorUserId: userId, status: 'ACTIVE' },
    select: { id: true },
  })
  return collaborator ? 'collaborator' : null
}

/**
 * Returns the vehicle, with the caller's `access`, if they may see it at
 * all; else null. Existence of the vehicle is not authorization — every
 * route taking a vehicleId must call this (see CLAUDE.md).
 *
 * Owner-only behaviour (delete, settings, invites) checks
 * `vehicle.access === 'owner'` — or uses requireVehicleOwner().
 */
export async function requireVehicleAccess(vehicleId: string, userId: string): Promise<AccessibleVehicle | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle) return null
  const access = await vehicleAccessFor(vehicle, userId)
  return access ? { ...vehicle, access } : null
}

/** Returns the vehicle only if the caller has `owner` access, else null. */
export async function requireVehicleOwner(vehicleId: string, userId: string): Promise<AccessibleVehicle | null> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle) return null
  const access = await vehicleAccessFor(vehicle, userId, { ownerOnly: true })
  return access === 'owner' ? { ...vehicle, access } : null
}

/**
 * Every vehicle the caller can see, each with their access — the garage
 * and the vehicle list. Three batched queries, not one per vehicle, and
 * the same rules as vehicleAccessFor(): personal vehicles they own, company
 * vehicles of organisations they belong to (by role), and vehicles they
 * collaborate on. A company vehicle is never listed by `ownerId`.
 */
export async function listAccessibleVehicles(userId: string): Promise<AccessibleVehicle[]> {
  const [owned, company, collaborating] = await Promise.all([
    prisma.vehicle.findMany({ where: { ownerId: userId, organizationId: null }, orderBy: { updatedAt: 'desc' } }),
    prisma.vehicle.findMany({
      where: { organization: { members: { some: { userId } } } },
      include: {
        organization: { select: { members: { where: { userId }, select: { role: true } } } },
        assignments: { where: { driverUserId: userId, endedAt: null }, select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.vehicle.findMany({
      where: { collaborators: { some: { collaboratorUserId: userId, status: 'ACTIVE' } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ])
  const seen = new Set<string>()
  const out: AccessibleVehicle[] = []
  const add = (vehicle: Vehicle, access: VehicleAccess) => {
    if (seen.has(vehicle.id)) return
    seen.add(vehicle.id)
    out.push({ ...vehicle, access })
  }
  for (const v of owned) add(v, 'owner')
  for (const { organization, assignments, ...v } of company) {
    const role = organization?.members[0]?.role
    if (!role) continue
    const access = accessForRole(role)
    if (access !== 'driver' || assignments.length > 0) add(v, access)
  }
  // Already listed with owner access, a vehicle is not listed again. The
  // account of record of a company vehicle who has left the organisation
  // is in none of these three.
  for (const v of collaborating) add(v, 'collaborator')
  return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}
