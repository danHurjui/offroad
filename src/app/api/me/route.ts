import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'

// RL-009: user profile & settings.
export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      location: true,
      avatarUrl: true,
      isPublicProfile: true,
      preferredMode: true,
      accountType: true,
      isPro: true,
      notifyFollowedEmail: true,
      notifyFollowedPush: true,
      createdAt: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.displayName !== undefined) {
      if (!body.displayName) return NextResponse.json({ error: 'displayName cannot be empty' }, { status: 400 })
      data.displayName = String(body.displayName)
    }
    if (body.location !== undefined) data.location = body.location || null
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null
    if (body.isPublicProfile !== undefined) data.isPublicProfile = Boolean(body.isPublicProfile)
    if (body.preferredMode !== undefined) {
      if (body.preferredMode !== null && body.preferredMode !== 'OFFROAD' && body.preferredMode !== 'RESTORATION') {
        return NextResponse.json({ error: 'Invalid preferredMode' }, { status: 400 })
      }
      data.preferredMode = body.preferredMode
    }
    if (body.notifyFollowedEmail !== undefined) data.notifyFollowedEmail = Boolean(body.notifyFollowedEmail)
    if (body.notifyFollowedPush !== undefined) data.notifyFollowedPush = Boolean(body.notifyFollowedPush)

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        location: true,
        avatarUrl: true,
        isPublicProfile: true,
        preferredMode: true,
        notifyFollowedEmail: true,
        notifyFollowedPush: true,
      },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
