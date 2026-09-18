import { randomBytes } from 'crypto'
import { prisma } from './prisma'
import { resolveAppUrl } from './appUrl'
import { emailLocale, isEmailConfigured, sendEmail, verifyEmailEmail } from './email'

/**
 * Proving that whoever made an account can read the address on it.
 *
 * ## Who this is for
 *
 * Password signups, and only those. A Google signup arrives already
 * proved: the `signIn` callback in src/lib/auth.ts refuses an address
 * Google itself reports as `email_verified: false`, so by the time a row
 * is created the claim has been checked by the party that owns the
 * mailbox. Asking that person to click a second link would be asking them
 * to prove something twice.
 *
 * ## What it is actually worth
 *
 * Two things, and it is worth naming them because they decide where the
 * check is enforced below.
 *
 * Anyone could previously register with **somebody else's address**. That
 * squats the account — the real owner can never sign up — and it points
 * every notification this app sends at a stranger's inbox.
 *
 * And a throwaway address costs nothing, which is what makes a feedback
 * board and a parts-wanted feed worth spamming.
 *
 * Neither of those is about the person's own private garage, which is why
 * an unverified account keeps full use of it.
 */

/**
 * A day, against the password reset's hour.
 *
 * A reset is something you just asked for and are sitting waiting on. A
 * verification link arrives in the middle of signing up, competes with
 * whatever the person actually opened the app to do, and is routinely
 * found the next morning. An hour would expire most of them.
 */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

/** The columns any verification decision needs. Select these, not the flag. */
export const VERIFICATION_SELECT = { emailVerifiedAt: true } as const

export interface VerifiableUser {
  emailVerifiedAt?: Date | null
}

/**
 * Whether the app is in a position to ask anyone to verify.
 *
 * It takes a mail provider and a public address to send a link at all
 * (the same two things `forgot-password` checks before promising an
 * inbox). Without them, enforcing verification would lock every new
 * account out of the outward-facing features over a link that was never
 * sent and could never arrive — an unfixable wall, produced by an
 * operator's missing environment variable rather than by anything the
 * person did.
 *
 * So this fails **open**, for the same reason the rate limiter does: a
 * misconfiguration should degrade a defence, not brick the product. It is
 * reported on /admin/diagnostics so the degraded state is visible rather
 * than merely survivable.
 */
export function isVerificationEnforced(): boolean {
  return verificationDisabledReason() === null
}

/** Why verification is switched off, or null when it is on. For diagnostics. */
export function verificationDisabledReason(): 'noEmailProvider' | 'noAppUrl' | null {
  if (!isEmailConfigured()) return 'noEmailProvider'
  if (!resolveAppUrl()) return 'noAppUrl'
  return null
}

/**
 * Whether this account's address is proved.
 *
 * Note what it does **not** do: consult `isVerificationEnforced()`. This
 * is the fact, and the screens report the fact — a settings page that
 * said "verified" because the operator forgot a mail key would be lying.
 * Only the gates fold in whether the rule can fairly be applied.
 */
export function isEmailVerified(user: VerifiableUser | null | undefined): boolean {
  return Boolean(user?.emailVerifiedAt)
}

/**
 * Whether this account should be stopped from doing outward-facing things.
 *
 * The two halves have to be read together: an unverified account on a
 * deployment that cannot send mail is not the person's fault.
 */
export function isBlockedAsUnverified(user: VerifiableUser | null | undefined): boolean {
  return isVerificationEnforced() && !isEmailVerified(user)
}

/**
 * A fresh single-use link for this account.
 *
 * Outstanding tokens are deliberately **left alive** rather than
 * invalidated by a resend. Somebody resends because the first message has
 * not shown up; when both then arrive, whichever one they happen to open
 * has to work. Invalidating the older link optimises for an attack that
 * does not exist here — the token proves control of the mailbox, and
 * anyone holding either link already has that — at the cost of a dead
 * link in a real person's inbox.
 *
 * Consuming any of them spends all of them (see below), so this does not
 * leave live credentials lying around after the job is done.
 */
export async function issueVerificationToken(
  userId: string
): Promise<{ id: string; token: string }> {
  const created = await prisma.emailVerificationToken.create({
    data: {
      userId,
      token: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    },
  })
  // The id comes back too, because the only caller has to be able to take
  // it away again when the message it was minted for fails to send.
  return { id: created.id, token: created.token }
}

/** The address the link in the email points at. */
export function verificationUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/verify-email?token=${token}`
}

export type VerificationSendOutcome =
  | { sent: true }
  /** Nothing was sent, and the caller must not claim otherwise. */
  | { sent: false; reason: 'notConfigured' | 'sendFailed' }

/**
 * Issues a token and mails it.
 *
 * Reports whether it actually went, because both callers have to tell the
 * truth about it: registration says "check your inbox" on its
 * confirmation screen, and the resend button says it sent. Neither may
 * say so when this returned false — that is the exact shape of the bug
 * this codebase already fixed once in the forgot-password flow.
 *
 * Never throws. A failure here must not take down the registration that
 * triggered it: the account is real, and the link can be resent.
 */
export async function sendVerificationEmail(user: {
  id: string
  email: string
  locale?: string | null
}): Promise<VerificationSendOutcome> {
  const baseUrl = resolveAppUrl()
  if (!isEmailConfigured() || !baseUrl) {
    console.error(
      '[verify-email] cannot send a verification link: ' +
        (isEmailConfigured()
          ? 'no usable public address — set NEXTAUTH_URL to this site\'s origin.'
          : 'no email provider — set BREVO_API_KEY or RESEND_API_KEY.') +
        ' Verification is not being enforced while this is true.'
    )
    return { sent: false, reason: 'notConfigured' }
  }

  let tokenId: string | null = null
  try {
    const issued = await issueVerificationToken(user.id)
    tokenId = issued.id

    const { subject, html } = await verifyEmailEmail(
      emailLocale(user),
      verificationUrl(baseUrl, issued.token)
    )
    await sendEmail({ to: user.email, subject, html })
    return { sent: true }
  } catch (e) {
    // sendEmail has already logged the provider's own reason. Drop the
    // token rather than leave a live credential nobody ever received —
    // the same rule the password-reset route follows. Best effort: a
    // failure to tidy up must not become the caller's problem, and the
    // row expires on its own anyway.
    console.error('[verify-email] send failed:', e)
    if (tokenId) {
      await prisma.emailVerificationToken.delete({ where: { id: tokenId } }).catch(() => {})
    }
    return { sent: false, reason: 'sendFailed' }
  }
}

export type VerificationResult =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; reason: 'invalid' | 'expired' }

/**
 * Spends a token and marks the address verified.
 *
 * Deliberately idempotent about an **already used** token: a link that
 * has done its job reports success rather than "invalid". Mail clients
 * prefetch links, people press back, and a second click that answers
 * "this link is invalid" to somebody whose account is verified is a false
 * alarm about a thing that worked.
 *
 * An expired token is a different answer, because it needs a different
 * action — ask for a new one.
 */
export async function consumeVerificationToken(token: string): Promise<VerificationResult> {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    select: { id: true, userId: true, used: true, expiresAt: true },
  })
  if (!record) return { ok: false, reason: 'invalid' }

  if (record.used) {
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: VERIFICATION_SELECT,
    })
    // A spent token on a verified account is the back button, not an
    // attack. A spent token on an account that is somehow *not* verified
    // is a genuine dead end and has to be answered as one.
    return isEmailVerified(user) ? { ok: true, alreadyVerified: true } : { ok: false, reason: 'expired' }
  }

  if (record.expiresAt < new Date()) return { ok: false, reason: 'expired' }

  // The flag and the spending of the token go together, or a failure
  // between them leaves an account that clicked a now-dead link and is
  // still unverified.
  //
  // Every outstanding token for this account is spent, not just the one
  // presented: they all prove the same thing, and the job is done.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.updateMany({
      where: { userId: record.userId, used: false },
      data: { used: true },
    }),
  ])

  return { ok: true, alreadyVerified: false }
}
