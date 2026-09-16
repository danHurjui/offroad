import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import { isTicketType, isTicketStatus, isTicketSort } from '@/lib/tickets'

const PAGE_SIZE = 25

/**
 * Admin ticket listing — the same data as the public board plus the
 * author's email, so a report can be followed up. Triage itself goes
 * through the existing PATCH /api/tickets/[id], which already separates
 * author edits from admin status changes; there's no second code path for
 * it here.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim() ?? ''
  const sort = isTicketSort(searchParams.get('sort')) ? searchParams.get('sort') : 'newest'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  try {
    const where = {
      ...(isTicketType(type) ? { type } : {}),
      ...(isTicketStatus(status) ? { status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy:
          sort === 'votes'
            ? [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          author: { select: { id: true, displayName: true, email: true } },
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
        adminNote: t.adminNote,
        author: t.author,
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
