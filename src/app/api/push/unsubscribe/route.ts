import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    if (!endpoint) return await apiError('endpointRequired', 400)

    // Scoped to the caller's own userId so one user can't unsubscribe
    // another's device by guessing/reusing an endpoint string.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })

    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
