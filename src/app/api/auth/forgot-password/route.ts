import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'
import { readJsonBody } from '@/lib/requestBody'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

// RL-001: request a password reset; always returns 200 regardless of
// whether the email exists, to avoid leaking account existence.
export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

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
