import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { isProjectType } from '@/lib/projectType'

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
  if (!user) return await apiError('notFound', 404)

  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const data: Record<string, unknown> = {}

    if (body.displayName !== undefined) {
      if (!body.displayName) return await apiError('displayNameEmpty', 400)
      data.displayName = String(body.displayName)
    }
    if (body.location !== undefined) data.location = body.location || null
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null
    if (body.isPublicProfile !== undefined) data.isPublicProfile = Boolean(body.isPublicProfile)
    if (body.preferredMode !== undefined) {
      if (body.preferredMode !== null && !isProjectType(body.preferredMode)) {
        return await apiError('invalidPreferredMode', 400)
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
    return await apiError('internalError', 500)
  }
}
