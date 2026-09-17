import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { hashPassword, isPasswordStrongEnough } from '@/lib/password'
import { generateUsername } from '@/lib/username'
import { createUserWithFoundingGrant } from '@/lib/foundingMembers'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'

// RL-001: register with email+password, no distinguishing error messages
// leak which emails exist.
export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit('register', `ip:${clientIp(req.headers)}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

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
    const user = await createUserWithFoundingGrant({
      email,
      password: hashed,
      displayName,
      username,
      accountType: 'OWNER',
      active: true,
    })

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        // Told to the client so the signup flow can say so. Null once the
        // promotion is over.
        foundingNumber: user.foundingNumber,
      },
      { status: 201 }
    )
  } catch {
    return await apiError('internalError', 500)
  }
}
