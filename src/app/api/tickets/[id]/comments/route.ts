import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { validateText, TICKET_COMMENT_MAX } from '@/lib/tickets'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'

/** Comment on a ticket. Any logged-in user. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  // Keyed on the user id, not the IP: a session id can't be rotated the
  // way a spoofed x-forwarded-for can.
  const limit = await consumeRateLimit('ticketComment', `user:${session.user.id}`)
  if (!limit.ok) return rateLimitResponse(limit)

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const commentBody = validateText(body.body, 'body', TICKET_COMMENT_MAX)
    if (!commentBody.ok) return NextResponse.json({ error: commentBody.error }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    })

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        body: commentBody.value,
        // Snapshot rather than joined at read time, so losing admin later
        // doesn't retroactively un-badge past staff replies.
        isStaff: Boolean(user?.isAdmin),
      },
      include: { user: { select: { displayName: true } } },
    })

    return NextResponse.json(
      {
        id: comment.id,
        body: comment.body,
        isStaff: comment.isStaff,
        authorName: comment.user.displayName,
        createdAt: comment.createdAt,
      },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
