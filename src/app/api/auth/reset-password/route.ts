import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, isPasswordStrongEnough } from '@/lib/password'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token = typeof body.token === 'string' ? body.token : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    if (!isPasswordStrongEnough(password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } })
    if (!record || record.used || record.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    const hashed = await hashPassword(password)
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    ])

    return NextResponse.json({ message: 'Password updated' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
