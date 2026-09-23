import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'

/**
 * The caller's membership of an organisation, or a 404 — to somebody
 * outside it, an organisation does not exist (same answer as a vehicle
 * they cannot see).
 */
export async function loadMembership(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  })
  if (!membership) return { ok: false as const, error: await apiError('notFound', 404) }
  return { ok: true as const, membership, role: membership.role }
}
