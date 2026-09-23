import { createHash } from 'crypto'
import { generateInviteToken, isInviteExpired, INVITE_EXPIRY_DAYS } from './collaborators'

/**
 * RL-038 slice 2: invitations to an organisation. Server-only (it hashes
 * with node:crypto) — client components import `organizations.ts`, never
 * this.
 *
 * The flow is the collaborator one (RL-030): a 32-byte token, seven days,
 * resend issues a new token, the owner can withdraw it, and accepting
 * needs a session whose address is the invited one — a forwarded email
 * cannot pull somebody else's account into a company. One difference:
 * only the token's SHA-256 is stored, because what it grants is a place
 * in a company rather than read access to one vehicle.
 */

/** Pending invitations one organisation may hold at a time. */
export const ORG_PENDING_INVITE_LIMIT = 50

export type InviteStatus = 'pending' | 'expired' | 'accepted' | 'revoked'

export function newInviteToken(): { token: string; tokenHash: string } {
  const token = generateInviteToken()
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function inviteStatus(
  invite: { invitedAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date()
): InviteStatus {
  if (invite.acceptedAt) return 'accepted'
  if (invite.revokedAt) return 'revoked'
  return isInviteExpired(invite.invitedAt, now) ? 'expired' : 'pending'
}

export function orgInviteAcceptUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/organizations/accept?token=${token}`
}

/** Pending means not accepted, not withdrawn and not yet expired, as a query. */
export function pendingInviteWhere(now: Date = new Date()) {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - INVITE_EXPIRY_DAYS)
  return { acceptedAt: null, revokedAt: null, invitedAt: { gt: cutoff } } as const
}
