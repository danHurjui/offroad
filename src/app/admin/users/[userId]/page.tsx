import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import { PROJECT_TYPE_CONFIG, type ProjectType } from '@/lib/projectType'
import { TICKET_TYPES, TICKET_STATUSES, type TicketType, type TicketStatus } from '@/lib/tickets'
import AdminUserActiveToggle from '@/components/AdminUserActiveToggle'
import AdminCompProToggle from '@/components/AdminCompProToggle'

export const metadata: Metadata = { title: 'User — RigLog admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({ params }: { params: { userId: string } }) {
  const session = await requireAdminOrNotFound()

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true, email: true, displayName: true, username: true, location: true,
      isPro: true, proPlan: true, isAdmin: true, active: true, accountType: true, createdAt: true,
      isProComped: true, proCompedAt: true, proCompedReason: true, proCompedById: true,
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
      ? 'This is you'
      : user.isAdmin
        ? 'Admin — change in the database'
        : undefined

  return (
    <div>
      <Link href="/admin/users" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to users
      </Link>

      <div className="card mb-6 flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink">{user.displayName}</h1>
            {user.isAdmin && <span className="badge badge-warn">admin</span>}
            {user.isPro && (
              <span className="badge badge-brand">Pro{user.proPlan ? ` · ${user.proPlan}` : ''}</span>
            )}
            {user.isProComped && <span className="badge badge-success">Pro · comped</span>}
            {!user.active && <span className="badge badge-danger">deactivated</span>}
          </div>
          <p className="text-sm text-ink-muted">{user.email}</p>
          <p className="text-xs text-ink-faint">
            {user.username ? `@${user.username} · ` : ''}
            {user.location ? `${user.location} · ` : ''}
            joined {new Date(user.createdAt).toLocaleDateString('ro-RO')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AdminCompProToggle
            userId={user.id} displayName={user.displayName} isProComped={user.isProComped} isPro={user.isPro}
          />
          <AdminUserActiveToggle
            userId={user.id} displayName={user.displayName} active={user.active} disabledReason={reason}
          />
        </div>
      </div>

      {user.isProComped && (
        <div className="card mb-6 note-success p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">
            Complimentary Pro
          </div>
          <p className="mt-1 text-sm text-ink">
            {user.proCompedReason || 'No reason recorded.'}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            granted {user.proCompedAt ? new Date(user.proCompedAt).toLocaleDateString('ro-RO') : 'unknown'}
            {user.proCompedById ? ` by ${user.proCompedById}` : ''}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Vehicles', user._count.vehicles],
          ['Tickets', user._count.tickets],
          ['Comments', user._count.ticketComments],
          ['Donations', user._count.donations],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
            <div className="mt-1 text-xl font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Vehicles</h2>
      {user.vehicles.length === 0 ? (
        <p className="card mb-6 p-4 text-sm text-ink-faint">No vehicles.</p>
      ) : (
        <div className="card mb-6 divide-y divide-surface-border">
          {user.vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 p-3">
              <span className="text-sm text-ink">
                {v.year} {v.make} {v.model}
              </span>
              <span className="flex items-center gap-2">
                <span className="badge bg-surface-subtle text-ink-muted">
                  {PROJECT_TYPE_CONFIG[v.projectType as ProjectType].label}
                </span>
                {v.isPublic && <span className="badge badge-success">public</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Tickets</h2>
      {user.tickets.length === 0 ? (
        <p className="card p-4 text-sm text-ink-faint">No tickets.</p>
      ) : (
        <div className="card divide-y divide-surface-border">
          {user.tickets.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-surface-muted">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`badge ${TICKET_TYPES[t.type as TicketType].badgeClass}`}>
                  {TICKET_TYPES[t.type as TicketType].label}
                </span>
                <span className={`badge ${TICKET_STATUSES[t.status as TicketStatus].badgeClass}`}>
                  {TICKET_STATUSES[t.status as TicketStatus].label}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
