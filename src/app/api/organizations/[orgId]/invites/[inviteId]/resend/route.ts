import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireVerifiedSession } from '@/lib/authz'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { inviteStatus, newInviteToken } from '@/lib/organizationInvites'
import { loadInviteForOwner } from '../../load'
import { sendOrganizationInvite } from '../../send'

/**
 * Resends an invitation that is still open — pending or expired — with a
 * new token and a fresh seven days; the old link stops working. Owners
 * only, confirmed address, same rate limit as sending one.
 */
export async function POST(_req: NextRequest, { params }: { params: { orgId: string; inviteId: string } }) {
  const auth = await requireVerifiedSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadInviteForOwner(params.orgId, params.inviteId, session.user.id)
  if (!loaded.ok) return loaded.error
  const status = inviteStatus(loaded.invite)
  if (status === 'accepted' || status === 'revoked') return await apiError('onlyPendingResend', 400)

  const limit = await consumeRateLimit('orgInvite', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  try {
    const { token, tokenHash } = newInviteToken()
    const updated = await prisma.organizationInvite.update({
      where: { id: loaded.invite.id },
      data: { tokenHash, invitedAt: new Date(), invitedByUserId: session.user.id },
    })
    await sendOrganizationInvite({
      inviterId: session.user.id,
      organizationName: loaded.membership.organization.name,
      email: updated.email,
      role: updated.role,
      token,
    })
    const { tokenHash: _hash, ...safe } = updated
    return NextResponse.json(safe)
  } catch {
    return await apiError('internalError', 500)
  }
}
