import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import {
  isTicketType,
  isTicketStatus,
  isTicketSort,
  validateText,
  TICKET_TITLE_MAX,
  TICKET_DESCRIPTION_MAX,
} from '@/lib/tickets'

const PAGE_SIZE = 25

/**
 * Public feedback board listing — deliberately readable without a session,
 * since the board doubles as RigLog's public roadmap. Posting, voting and
 * commenting still require one.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const sort = isTicketSort(searchParams.get('sort')) ? searchParams.get('sort') : 'votes'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  try {
    const where = {
      ...(isTicketType(type) ? { type } : {}),
      ...(isTicketStatus(status) ? { status } : {}),
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        // Vote count lives in a join table, so ordering by it is done by
        // Prisma's relation sort rather than a denormalised counter — no
        // counter to drift out of sync with the actual votes.
        orderBy:
          sort === 'votes'
            ? [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          author: { select: { displayName: true } },
          _count: { select: { votes: true, comments: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ])

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        title: t.title,
        authorName: t.author.displayName,
        voteCount: t._count.votes,
        commentCount: t._count.comments,
        createdAt: t.createdAt,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Open a bug report / feature request. Any logged-in user; not Pro-gated. */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    if (!isTicketType(body.type)) {
      return NextResponse.json({ error: 'type must be BUG, FEATURE or IMPROVEMENT' }, { status: 400 })
    }
    const title = validateText(body.title, 'title', TICKET_TITLE_MAX)
    if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 })
    const description = validateText(body.description, 'description', TICKET_DESCRIPTION_MAX)
    if (!description.ok) return NextResponse.json({ error: description.error }, { status: 400 })

    // The author's own vote is implied — opening a request means you want
    // it, and seeding it keeps a brand new ticket from showing "0 votes".
    const ticket = await prisma.ticket.create({
      data: {
        authorId: session.user.id,
        type: body.type,
        title: title.value,
        description: description.value,
        votes: { create: { userId: session.user.id } },
      },
      include: { _count: { select: { votes: true } } },
    })

    return NextResponse.json(
      { id: ticket.id, type: ticket.type, status: ticket.status, title: ticket.title, voteCount: ticket._count.votes },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
