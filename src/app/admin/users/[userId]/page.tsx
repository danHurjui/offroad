import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import { type ProjectType } from '@/lib/projectType'
import { getAllVocabulary } from '@/lib/vocabulary'
import { isGrandfathered } from '@/lib/plans'
import { TICKET_TYPES, TICKET_STATUSES, type TicketType, type TicketStatus } from '@/lib/tickets'
import AdminUserActiveToggle from '@/components/AdminUserActiveToggle'
import AdminCompProToggle from '@/components/AdminCompProToggle'
import AdminOrgBetaToggle from '@/components/AdminOrgBetaToggle'

export const metadata: Metadata = { title: 'User — RigLog admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({ params }: { params: { userId: string } }) {
  const t = await getTranslations('admin')
  const tv = await getTranslations('ticketVocab')
  const session = await requireAdminOrNotFound()

  const vocabulary = await getAllVocabulary()
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true, email: true, displayName: true, username: true, location: true,
      isPro: true, proPlan: true, grandfatheredAt: true, isAdmin: true, active: true, accountType: true, createdAt: true,
      isProComped: true, foundingNumber: true, proCompedAt: true, proCompedReason: true, proCompedById: true, orgBetaAt: true,
      vehicles: {
        select: { id: true, make: true, model: true, year: true, projectType: true, isPublic: true },
        orderBy: { createdAt: 'desc' },
      },
      tickets: {
        select: { id: true, title: true, type: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      },
      _count: { select: { vehicles: true, tickets: true, ticketComments: true, donations: true } },
    },
  })
  if (!user) notFound()

  const reason =
    user.id === session.user.id
      ? t('thisIsYou')
      : user.isAdmin
        ? t('adminChangeInDb')
        : undefined

  return (
    <div>
      <Link href="/admin/users" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {t('backToUsers')}
      </Link>

      <div className="card mb-6 flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink">{user.displayName}</h1>
            {user.isAdmin && <span className="badge badge-warn">{t('adminBadge')}</span>}
            {user.isPro && (
              <span className="badge badge-brand">{t('proBadge')}{user.proPlan ? ` · ${user.proPlan}` : ''}</span>
            )}
            {isGrandfathered(user) && <span className="badge badge-success">{t('grandfatheredBadge')}</span>}
            {user.isProComped && (
              <span className="badge badge-success">
                {user.foundingNumber !== null
                  ? t('foundingMemberNumber', { number: user.foundingNumber })
                  : t('proComped')}
              </span>
            )}
            {!user.active && <span className="badge badge-danger">{t('deactivatedBadge')}</span>}
            {user.orgBetaAt && <span className="badge badge-brand">{t('orgBetaBadge')}</span>}
          </div>
          <p className="text-sm text-ink-muted">{user.email}</p>
          <p className="text-xs text-ink-faint">
            {user.username ? `@${user.username} · ` : ''}
            {user.location ? `${user.location} · ` : ''}
            {t('joined', { date: new Date(user.createdAt).toLocaleDateString('ro-RO') })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AdminCompProToggle
            userId={user.id} displayName={user.displayName} isProComped={user.isProComped} isPro={user.isPro}
          />
          <AdminOrgBetaToggle userId={user.id} enabled={user.orgBetaAt !== null} />
          <AdminUserActiveToggle
            userId={user.id} displayName={user.displayName} active={user.active} disabledReason={reason}
          />
        </div>
      </div>

      {user.isProComped && (
        <div className="card mb-6 note-success p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">
            {t('complimentaryPro')}
          </div>
          <p className="mt-1 text-sm text-ink">
            {user.proCompedReason || t('noReasonRecorded')}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {t('grantedOn', {
              date: user.proCompedAt
                ? new Date(user.proCompedAt).toLocaleDateString('ro-RO')
                : t('unknownDate'),
            })}
            {user.proCompedById ? t('grantedBy', { who: user.proCompedById }) : ''}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('countVehicles'), user._count.vehicles],
          [t('countTickets'), user._count.tickets],
          [t('countComments'), user._count.ticketComments],
          [t('countDonations'), user._count.donations],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
            <div className="mt-1 text-xl font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('countVehicles')}</h2>
      {user.vehicles.length === 0 ? (
        <p className="card mb-6 p-4 text-sm text-ink-faint">{t('noVehicles')}</p>
      ) : (
        <div className="card mb-6 divide-y divide-surface-border">
          {user.vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 p-3">
              <span className="text-sm text-ink">
                {v.year} {v.make} {v.model}
              </span>
              <span className="flex items-center gap-2">
                <span className="badge bg-surface-subtle text-ink-muted">
                  {vocabulary[v.projectType as ProjectType].label}
                </span>
                {v.isPublic && <span className="badge badge-success">public</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('countTickets')}</h2>
      {user.tickets.length === 0 ? (
        <p className="card p-4 text-sm text-ink-faint">{t('noTicketsShort')}</p>
      ) : (
        <div className="card divide-y divide-surface-border">
          {user.tickets.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-surface-muted">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`badge ${TICKET_TYPES[t.type as TicketType].badgeClass}`}>
                  {tv(`type.${t.type as TicketType}.label`)}
                </span>
                <span className={`badge ${TICKET_STATUSES[t.status as TicketStatus].badgeClass}`}>
                  {tv(`status.${t.status as TicketStatus}`)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
