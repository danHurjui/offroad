import { prisma } from './prisma'
import { hasPro, PRO_SELECT } from './pro'
import { ORG_PLAN_SELECT, orgHasPaidFeatures } from './plans'

/**
 * RL-042 slice 3b: whether a vehicle gets the paid features — the one
 * question every gate on a vehicle asks.
 *
 * - A **personal** vehicle: its owner's plan (`hasPro()` — Personal,
 *   grandfathered Pro, or a comp).
 * - A **company** vehicle: the **organisation's** plan (a company plan, or
 *   comped), never the account of record's and never the viewer's. A
 *   Business customer gets every feature on every company vehicle whoever
 *   moved it in, and a manager who happens to pay for Personal does not
 *   unlock a company that does not pay.
 *
 * Never ask the caller's own plan about a vehicle — a collaborator
 * uploading to a Personal owner's vehicle gets the owner's allowance, and a
 * fleet manager on a paying organisation's vehicle gets the organisation's.
 * `entitlement.test.ts` fails on a vehicle gate that reads `PRO_SELECT`
 * itself.
 */
export async function vehicleHasPro(vehicle: { ownerId: string; organizationId: string | null }): Promise<boolean> {
  if (vehicle.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: vehicle.organizationId }, select: ORG_PLAN_SELECT })
    return orgHasPaidFeatures(org)
  }
  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: PRO_SELECT })
  return hasPro(owner)
}
