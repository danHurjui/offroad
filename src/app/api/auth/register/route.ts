import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { hashPassword, isPasswordStrongEnough } from '@/lib/password'
import { generateUsername } from '@/lib/username'
import { createUserWithFoundingGrant } from '@/lib/foundingMembers'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { verifyTurnstile } from '@/lib/turnstile'
import { isVerificationEnforced, sendVerificationEmail } from '@/lib/emailVerification'

// RL-001: register with email+password, no distinguishing error messages
// leak which emails exist.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  const limit = await consumeRateLimit('register', `ip:${ip}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  // Before anything is read from or written to the database. The point of
  // the check is that a script doesn't get to spend those queries.
  const bot = await verifyTurnstile(body.turnstileToken, ip)
  if (!bot.ok) return await apiError('botCheckFailed', 400)

  try {
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''

    if (!email || !email.includes('@')) {
      return await apiError('emailInvalid', 400)
    }
    if (!isPasswordStrongEnough(password)) {
      return await apiError('passwordTooShort', 400)
    }
    if (!displayName) {
      return await apiError('displayNameRequired', 400)
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return await apiError('registrationFailed', 400)
    }

    const hashed = await hashPassword(password)
    const username = await generateUsername(displayName)

    // Shared with the Google sign-in path so the promotion means "the
    // first hundred accounts" rather than "the first hundred passwords".
    //
    // No emailVerifiedAt: this is the path that has proved nothing yet.
    // The Google path sets it at creation, because Google has already
    // done the proving — see the signIn callback in src/lib/auth.ts.
    const user = await createUserWithFoundingGrant({
      email,
      password: hashed,
      displayName,
      username,
      accountType: 'OWNER',
      active: true,
    })

    // After the account exists, and never allowed to undo it. A mail
    // provider that is down or misconfigured is the operator's problem,
    // not a reason to refuse somebody an account they have just filled a
    // form in for — the link can be resent from Settings. What the
    // response must not do is *claim* it was sent when it wasn't.
    const delivery = await sendVerificationEmail(user)

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        // Told to the client so the signup flow can say so. Null once the
        // promotion is over.
        foundingNumber: user.foundingNumber,
        // Both are needed to write an honest confirmation line: whether a
        // link is on its way, and whether anything is being withheld until
        // it is opened. On a deployment with no mail provider the answer
        // to both is no, and saying "check your inbox" there would be the
        // lie this codebase already removed from the reset flow once.
        verificationEmailSent: delivery.sent,
        verificationRequired: isVerificationEnforced(),
      },
      { status: 201 }
    )
  } catch {
    return await apiError('internalError', 500)
  }
}
