import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'

// RL-023: saves a browser's Web Push subscription (from
// PushManager.subscribe() client-side). One row per device/browser —
// upserted on endpoint so re-subscribing (e.g. after clearing site data)
// doesn't create duplicates.
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : ''
    const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : ''

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: session.user.id, p256dh, auth: authKey },
      create: { userId: session.user.id, endpoint, p256dh, auth: authKey },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
