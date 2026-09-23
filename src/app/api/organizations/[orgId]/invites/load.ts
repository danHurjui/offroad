import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { canManageOrganization } from '@/lib/organizations'
import { loadMembership } from '../../load'

/** An invitation of this organisation, for one of its owners; 404 otherwise. */
export async function loadInviteForOwner(organizationId: string, inviteId: string, userId: string) {
  const loaded = await loadMembership(organizationId, userId)
  if (!loaded.ok) return loaded
  if (!canManageOrganization(loaded.role)) return { ok: false as const, error: await apiError('orgOwnerOnly', 403) }
  const invite = await prisma.organizationInvite.findUnique({ where: { id: inviteId } })
  if (!invite || invite.organizationId !== organizationId) return { ok: false as const, error: await apiError('notFound', 404) }
  return { ok: true as const, membership: loaded.membership, invite }
}
