import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { TICKET_TYPE_VALUES, TICKET_STATUS_VALUES, isTicketType, isTicketStatus, isTicketSort, type TicketType, type TicketStatus } from '@/lib/tickets'
import AdminTicketRow from '@/components/AdminTicketRow'

export const metadata: Metadata = { title: 'Tickets — RigLog admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string; q?: string; sort?: string; page?: string }
}) {
  const tv = await getTranslations('ticketVocab')
  const type = isTicketType(searchParams.type) ? searchParams.type : undefined
  const status = isTicketStatus(searchParams.status) ? searchParams.status : undefined
  const q = searchParams.q?.trim() ?? ''
  const sort = isTicketSort(searchParams.sort) ? searchParams.sort : 'newest'
  const page = Math.max(1, Number(searchParams.page) || 1)

  const where = {
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
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
      orderBy: sort === 'votes' ? [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        author: { select: { id: true, displayName: true, email: true } },
        _count: { select: { votes: true, comments: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { type, status, q, sort: sort === 'newest' ? undefined : sort, ...extra }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v))
    const out = p.toString()
    return out ? `/admin/tickets?${out}` : '/admin/tickets'
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Tickets</h1>
        <span className="text-sm text-ink-muted">{total} total</span>
      </div>

      <form className="card mb-3 flex flex-wrap gap-3 p-4" method="get">
        <input type="text" name="q" defaultValue={q} placeholder="Search title or description…" className="input min-w-48 flex-1" />
        <select name="type" defaultValue={type ?? ''} className="input w-44">
          <option value="">All types</option>
          {TICKET_TYPE_VALUES.map((t) => (
            <option key={t} value={t}>{tv(`type.${t}.label`)}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ''} className="input w-40">
          <option value="">All statuses</option>
          {TICKET_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>{tv(`status.${s}`)}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="input w-36">
          <option value="newest">Newest</option>
          <option value="votes">Most voted</option>
        </select>
        <button type="submit" className="btn-primary">Filter</button>
        {(q || type || status) && <Link href="/admin/tickets" className="btn-secondary">Clear</Link>}
      </form>

      {tickets.length === 0 ? (
        <p className="card p-8 text-center text-ink-muted">No tickets match those filters.</p>
      ) : (
        <div className="card divide-y divide-surface-border">
          {tickets.map((t) => (
            <AdminTicketRow
              key={t.id}
              ticket={{
                id: t.id,
                type: t.type as TicketType,
                status: t.status as TicketStatus,
                title: t.title,
                adminNote: t.adminNote,
                authorId: t.author.id,
                authorName: t.author.displayName,
                authorEmail: t.author.email,
                voteCount: t._count.votes,
                commentCount: t._count.comments,
                createdAt: t.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="btn-secondary">← Previous</Link> : <span />}
          <span className="text-ink-muted">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={href({ page: String(page + 1) })} className="btn-secondary">Next →</Link> : <span />}
        </div>
      )}
    </div>
  )
}
