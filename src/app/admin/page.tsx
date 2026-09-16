import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { TICKET_STATUSES, TICKET_STATUS_VALUES } from '@/lib/tickets'
import { formatRon } from '@/lib/donations'

export const metadata: Metadata = { title: 'Admin — RigLog', robots: { index: false } }
export const dynamic = 'force-dynamic'

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
    </div>
  )
  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export default async function AdminOverviewPage() {
  const tv = await getTranslations('ticketVocab')
  const [users, activeUsers, proUsers, vehicles, tickets, openTickets, donations, statusCounts] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.user.count({ where: { OR: [{ isPro: true }, { isProComped: true }] } }),
      prisma.vehicle.count(),
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'PLANNED', 'IN_PROGRESS'] } } }),
      prisma.donation.aggregate({ where: { status: 'PAID' }, _sum: { amountBani: true }, _count: true }),
      prisma.ticket.groupBy({ by: ['status'], _count: true }),
    ])

  const byStatus = new Map(statusCounts.map((s) => [s.status, s._count]))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-ink">Overview</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Users" value={users} href="/admin/users" />
        <Stat label="Active" value={activeUsers} href="/admin/users?status=active" />
        <Stat label="Deactivated" value={users - activeUsers} href="/admin/users?status=inactive" />
        <Stat label="Pro (incl. comped)" value={proUsers} />
        <Stat label="Vehicles" value={vehicles} />
        <Stat label="Tickets" value={tickets} href="/admin/tickets" />
        <Stat label="Open tickets" value={openTickets} href="/admin/tickets?status=OPEN" />
        <Stat
          label="Donated"
          value={donations._count === 0 ? '—' : formatRon(donations._sum.amountBani ?? 0)}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Tickets by status
      </h2>
      <div className="card divide-y divide-surface-border">
        {TICKET_STATUS_VALUES.map((status) => (
          <Link
            key={status}
            href={`/admin/tickets?status=${status}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted"
          >
            <span className={`badge ${TICKET_STATUSES[status].badgeClass}`}>
              {tv(`status.${status}`)}
            </span>
            <span className="font-semibold text-ink">{byStatus.get(status) ?? 0}</span>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        Pro status is set by the Stripe webhook and admin rights are granted directly in the database
        — neither can be changed from these screens. See CLAUDE.md for why.
      </p>
    </div>
  )
}
