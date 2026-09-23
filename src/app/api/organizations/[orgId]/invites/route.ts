import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireVerifiedSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { isValidEmail } from '@/lib/collaborators'
import { canManageOrganization, isOrgRole } from '@/lib/organizations'
import { newInviteToken, ORG_PENDING_INVITE_LIMIT, pendingInviteWhere } from '@/lib/organizationInvites'
import { loadMembership } from '../../load'
import { sendOrganizationInvite } from './send'

/**
 * RL-038: invite somebody to the organisation with a role. Owners only.
 *
 * An invitation is mail sent in the owner's name to an address they chose,
 * so it needs a confirmed address (like the collaborator invite) and is
 * rate-limited on the user id.
 */
export async function POST(req: NextRequest, { params }: { params: { orgId: string } }) {
  const auth = await requireVerifiedSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (!canManageOrganization(loaded.role)) return await apiError('orgOwnerOnly', 403)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const email = typeof parsed.body.email === 'string' ? parsed.body.email.toLowerCase().trim() : ''
  if (!isValidEmail(email)) return await apiError('emailInvalid', 400)
  if (!isOrgRole(parsed.body.role)) return await apiError('orgRoleInvalid', 400)
  const role = parsed.body.role

  const limit = await consumeRateLimit('orgInvite', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  try {
    const existing = await prisma.organizationMember.findFirst({
      where: { organizationId: params.orgId, user: { email } },
      select: { id: true },
    })
    if (existing) return await apiError('orgAlreadyMember', 400)

    const pending = pendingInviteWhere()
    const [samePending, pendingCount] = await Promise.all([
      prisma.organizationInvite.findFirst({ where: { organizationId: params.orgId, email, ...pending }, select: { id: true } }),
      prisma.organizationInvite.count({ where: { organizationId: params.orgId, ...pending } }),
    ])
    if (samePending) return await apiError('orgAlreadyInvited', 400)
    if (pendingCount >= ORG_PENDING_INVITE_LIMIT) {
      return await apiErrorWith('orgInviteLimit', { limit: ORG_PENDING_INVITE_LIMIT }, 400)
    }

    const { token, tokenHash } = newInviteToken()
    const invite = await prisma.organizationInvite.create({
      data: { organizationId: params.orgId, email, role, tokenHash, invitedByUserId: session.user.id },
    })
    await sendOrganizationInvite({
      inviterId: session.user.id,
      organizationName: loaded.membership.organization.name,
      email,
      role,
      token,
    })
    const { tokenHash: _hash, ...safe } = invite
    return NextResponse.json(safe, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
