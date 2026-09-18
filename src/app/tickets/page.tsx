import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/pageMetadata'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  TICKET_TYPES,
  TICKET_STATUSES,
  TICKET_TYPE_VALUES,
  TICKET_STATUS_VALUES,
  isTicketType,
  isTicketStatus,
  isTicketSort,
} from '@/lib/tickets'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import TicketVoteButton from '@/components/TicketVoteButton'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tickets')
  return await publicPageMetadata({
    path: '/tickets',
    title: t('metaTitle'),
    description: t('metaDescription'),
  })
}

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string; sort?: string; page?: string }
}) {
  const tc = await getTranslations('common')
  const tv = await getTranslations('ticketVocab')
  const t = await getTranslations('tickets')
  const session = await getServerSession(authOptions)
  const type = isTicketType(searchParams.type) ? searchParams.type : undefined
  const status = isTicketStatus(searchParams.status) ? searchParams.status : undefined
  const sort = isTicketSort(searchParams.sort) ? searchParams.sort : 'votes'
  const page = Math.max(1, Number(searchParams.page) || 1)

  const where = { ...(type ? { type } : {}), ...(status ? { status } : {}) }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy:
        sort === 'votes' ? [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        author: { select: { displayName: true } },
        _count: { select: { votes: true, comments: true } },
        // Only this viewer's vote, so the button renders in the right
        // state without loading every vote row on every ticket.
        votes: session ? { where: { userId: session.user.id }, select: { id: true } } : false,
      },
    }),
    prisma.ticket.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function filterHref(next: { type?: string; status?: string; sort?: string }) {
    const params = new URLSearchParams()
    const t = next.type !== undefined ? next.type : type
    const s = next.status !== undefined ? next.status : status
    const so = next.sort !== undefined ? next.sort : sort
    if (t) params.set('type', t)
    if (s) params.set('status', s)
    if (so && so !== 'votes') params.set('sort', so)
    const qs = params.toString()
    return qs ? `/tickets?${qs}` : '/tickets'
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
            <p className="mt-2 max-w-2xl text-ink-muted">
              {t('intro')}
            </p>
          </div>
          <Link href="/tickets/new" className="btn-primary shrink-0">
            {t('open')}
          </Link>
        </div>

        {/* Filters */}
        <div className="card mb-6 space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('type')}</span>
            <Link
              href={filterHref({ type: '' })}
              className={`badge ${!type ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}
            >
              All
            </Link>
            {TICKET_TYPE_VALUES.map((t) => (
              <Link
                key={t}
                href={filterHref({ type: t })}
                className={`badge ${type === t ? TICKET_TYPES[t].badgeClass : 'bg-surface-subtle text-ink-muted'}`}
              >
                {tv(`type.${t}.label`)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('status')}</span>
            <Link
              href={filterHref({ status: '' })}
              className={`badge ${!status ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}
            >
              All
            </Link>
            {TICKET_STATUS_VALUES.map((s) => (
              <Link
                key={s}
                href={filterHref({ status: s })}
                className={`badge ${status === s ? TICKET_STATUSES[s].badgeClass : 'bg-surface-subtle text-ink-muted'}`}
              >
                {tv(`status.${s}`)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('sort')}</span>
            <Link
              href={filterHref({ sort: 'votes' })}
              className={`badge ${sort === 'votes' ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}
            >
              {t('mostVoted')}
            </Link>
            <Link
              href={filterHref({ sort: 'newest' })}
              className={`badge ${sort === 'newest' ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}
            >
              {t('newest')}
            </Link>
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-ink-muted">
              {total === 0 ? t('emptyAll') : t('emptyFiltered')}
            </p>
            <Link href="/tickets/new" className="btn-primary mt-4">
              {t('open')}
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="card flex items-start gap-4 p-4">
                <TicketVoteButton
                  ticketId={ticket.id}
                  initialVoted={Array.isArray(ticket.votes) && ticket.votes.length > 0}
                  initialCount={ticket._count.votes}
                  signedIn={Boolean(session)}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`badge ${TICKET_TYPES[ticket.type].badgeClass}`}>
                      {tv(`type.${ticket.type}.label`)}
                    </span>
                    <span className={`badge ${TICKET_STATUSES[ticket.status].badgeClass}`}>
                      {tv(`status.${ticket.status}`)}
                    </span>
                  </div>
                  <Link href={`/tickets/${ticket.id}`} className="block font-medium text-ink hover:text-brand-600 dark:hover:text-brand-300">
                    {ticket.title}
                  </Link>
                  <p className="mt-1 text-xs text-ink-faint">
                    {ticket.author.displayName} ·{' '}
                    {new Date(ticket.createdAt).toLocaleDateString('ro-RO')}
                    {ticket._count.comments > 0 && ` · ${ticket._count.comments} comment${ticket._count.comments === 1 ? '' : 's'}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={`${filterHref({})}${filterHref({}).includes('?') ? '&' : '?'}page=${page - 1}`} className="btn-secondary">
                {tc('previous')}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={`${filterHref({})}${filterHref({}).includes('?') ? '&' : '?'}page=${page + 1}`} className="btn-secondary">
                {tc('next')}
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  )
}
