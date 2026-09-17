import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'

// RL-024: "respond with a comment" — open to any logged-in user, not just
// Pro (posting the request itself is Pro-gated; replying to help someone
// out isn't, matching the community spirit of the feature).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const partsRequest = await prisma.partsRequest.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!partsRequest) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const commentBody = typeof body.body === 'string' ? body.body.trim() : ''
    if (!commentBody) return await apiError('bodyRequired', 400)

    const comment = await prisma.partsRequestComment.create({
      data: { partsRequestId: partsRequest.id, userId: session.user.id, body: commentBody },
      include: { user: { select: { displayName: true } } },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
