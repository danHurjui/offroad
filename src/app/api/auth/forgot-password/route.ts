import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, passwordResetEmailHtml, isEmailConfigured } from '@/lib/email'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { resolveAppUrl } from '@/lib/appUrl'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

// RL-001: request a password reset; always returns 200 regardless of
// whether the email exists, to avoid leaking account existence.
export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit('forgotPasswordIp', `ip:${clientIp(req.headers)}`)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    // Per-address limit: this is what stops someone's inbox being flooded
    // with reset mail. It counts regardless of whether the account exists,
    // so a 429 here still leaks nothing about account existence — the same
    // reason this route always 200s below.
    const emailLimit = await consumeRateLimit('forgotPassword', `email:${email}`)
    if (!emailLimit.ok) return rateLimitResponse(emailLimit)

    // Without a mail provider this route would hand back its reassuring
    // "check your inbox" message while sending nothing, stranding someone
    // out of their account with no way to tell why. Fail honestly instead.
    // Checked before the lookup so the answer can't vary by whether the
    // address exists.
    if (!isEmailConfigured()) {
      console.error(
        '[forgot-password] no email provider configured (BREVO_API_KEY / RESEND_API_KEY) — cannot send reset emails.'
      )
      return NextResponse.json(
        {
          error:
            'Password reset is temporarily unavailable because email is not configured. Please contact support.',
          code: 'EMAIL_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    // Same reasoning as the email check, and the same placement — before
    // the lookup, so the answer cannot vary by whether the address exists.
    // A reset email whose link points at a bogus host (issue #21: a base64
    // secret had been pasted into NEXTAUTH_URL) is worse than no email:
    // the token is spent, the person is told to check their inbox, and the
    // link they find there goes nowhere.
    const baseUrl = resolveAppUrl()
    if (!baseUrl) {
      console.error(
        '[forgot-password] no usable public URL — set NEXTAUTH_URL to the origin this app is ' +
          'served from (e.g. https://riglog.ro). Reset links cannot be built, so none were sent.'
      )
      return NextResponse.json(
        {
          error:
            'Password reset is temporarily unavailable because the site URL is not configured. Please contact support.',
          code: 'APP_URL_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (user && user.active) {
      const token = randomBytes(32).toString('hex')
      const created = await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      })
      const resetUrl = `${baseUrl}/reset-password?token=${token}`
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your RigLog password',
          html: passwordResetEmailHtml(resetUrl),
        })
      } catch (e) {
        // sendEmail has already logged the provider's reason. Drop the
        // token rather than leaving a live credential nobody received.
        //
        // This branch is only reachable for an address that *does* have an
        // account, so answering 502 here (rather than the neutral 200)
        // distinguishes a real account from an unknown one while the mail
        // provider is failing. That is a deliberate, narrow trade: the
        // common misconfiguration is caught by the isEmailConfigured()
        // check above, which runs before the lookup and so answers
        // identically either way. The remaining window needs the provider
        // to be actively broken — during which the reset flow is down for
        // everyone anyway — and telling someone "check your inbox" when we
        // already know the message bounced is the worse failure.
        console.error('[forgot-password] send failed for an existing account:', e)
        await prisma.passwordResetToken.delete({ where: { id: created.id } }).catch(() => {})
        return NextResponse.json(
          { error: 'We could not send the reset email. Please try again shortly.', code: 'EMAIL_SEND_FAILED' },
          { status: 502 }
        )
      }
    }

    return NextResponse.json({ message: 'If that email exists, a reset link has been sent.' })
  } catch (e) {
    console.error('[forgot-password] unexpected failure:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
