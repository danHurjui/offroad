import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'

// RL-024: "respond with a comment" — open to any logged-in user, not just
// Pro (posting the request itself is Pro-gated; replying to help someone
// out isn't, matching the community spirit of the feature).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const partsRequest = await prisma.partsRequest.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!partsRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const body = await req.json()
    const commentBody = typeof body.body === 'string' ? body.body.trim() : ''
    if (!commentBody) return NextResponse.json({ error: 'body is required' }, { status: 400 })

    const comment = await prisma.partsRequestComment.create({
      data: { partsRequestId: partsRequest.id, userId: session.user.id, body: commentBody },
      include: { user: { select: { displayName: true } } },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
