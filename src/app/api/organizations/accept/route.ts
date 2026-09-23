import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { hashInviteToken, inviteStatus } from '@/lib/organizationInvites'

/**
 * RL-038: accept an organisation invitation. The session's address must be
 * the invited one — holding the link is not enough, so a forwarded email
 * cannot pull another account in.
 *
 * Marking the invitation used is conditional (`acceptedAt: null`,
 * `revokedAt: null`) and in the same transaction as the membership, so a
 * double-click, or an owner withdrawing it at that moment, cannot produce
 * a member from a spent or withdrawn invitation.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const token = typeof parsed.body.token === 'string' ? parsed.body.token : ''
  if (!token) return await apiError('inviteTokenMissing', 400)

  try {
    const invite = await prisma.organizationInvite.findUnique({ where: { tokenHash: hashInviteToken(token) } })
    if (!invite) return await apiError('inviteNotFound', 404)
    const status = inviteStatus(invite)
    if (status === 'revoked') return await apiError('inviteRevoked', 410)
    if (status === 'accepted') return await apiError('inviteAlreadyAccepted', 400)
    if (status === 'expired') return await apiError('inviteExpired', 410)

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) return await apiError('inviteWrongEmail', 403)

    const joined = await prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      })
      if (claimed.count === 0) return false
      await tx.organizationMember.create({
        data: { organizationId: invite.organizationId, userId: session.user.id, role: invite.role },
      })
      return true
    })
    if (!joined) return await apiError('inviteAlreadyAccepted', 400)
    return NextResponse.json({ organizationId: invite.organizationId, role: invite.role })
  } catch (e) {
    // Already a member (the unique constraint): the transaction rolled
    // back, so the invitation is still open for nobody else to use.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return await apiError('orgAlreadyMember', 400)
    }
    return await apiError('internalError', 500)
  }
}
