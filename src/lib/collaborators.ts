import { randomBytes } from 'crypto'

/** RL-030: invite mechanic/specialist as project collaborator. */

export const INVITE_EXPIRY_DAYS = 7
export const FREE_TIER_COLLABORATOR_LIMIT = 3
export const DAILY_INVITE_LIMIT = 10

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

export function isInviteExpired(invitedAt: Date, now: Date = new Date()): boolean {
  const expiresAt = new Date(invitedAt)
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)
  return now.getTime() >= expiresAt.getTime()
}

export function inviteAcceptUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/collaborate/accept?token=${token}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value)
}
