import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'

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

    const user = await prisma.user.findUnique({ where: { email } })
    if (user && user.active) {
      const token = randomBytes(32).toString('hex')
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      })
      const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      const resetUrl = `${baseUrl}/reset-password?token=${token}`
      await sendEmail({
        to: user.email,
        subject: 'Reset your RigLog password',
        html: passwordResetEmailHtml(resetUrl),
      })
    }

    return NextResponse.json({ message: 'If that email exists, a reset link has been sent.' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
