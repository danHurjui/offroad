import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const body = await req.json()
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })

    // Scoped to the caller's own userId so one user can't unsubscribe
    // another's device by guessing/reusing an endpoint string.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
