import type { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { apiErrorWith } from './apiError'
import { LADDER, PLAN_SELECT, vehicleLimit } from './plans'

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
