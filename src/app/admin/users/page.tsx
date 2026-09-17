import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import AdminUserActiveToggle from '@/components/AdminUserActiveToggle'
import AdminCompProToggle from '@/components/AdminCompProToggle'

export const metadata: Metadata = { title: 'Users — RigLog admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string }
}) {
  const tc = await getTranslations('common')
  const t = await getTranslations('admin')
  const session = await requireAdminOrNotFound()
  const q = searchParams.q?.trim() ?? ''
  const status = searchParams.status === 'active' || searchParams.status === 'inactive' ? searchParams.status : undefined
  const page = Math.max(1, Number(searchParams.page) || 1)

  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { username: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(status === 'active' ? { active: true } : status === 'inactive' ? { active: false } : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, email: true, displayName: true, username: true,
        isPro: true, isProComped: true, foundingNumber: true, isAdmin: true, active: true, createdAt: true,
        _count: { select: { vehicles: true, tickets: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status) p.set('status', status)
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v)
    }
    const out = p.toString()
    return out ? `/admin/users?${out}` : '/admin/users'
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{t('users')}</h1>
        <span className="text-sm text-ink-muted">{t('total', { count: total })}</span>
      </div>

      <form className="card mb-4 flex flex-wrap gap-3 p-4" method="get">
        <input
          type="text" name="q" defaultValue={q} placeholder={t('searchUsers')}
          className="input flex-1 min-w-48"
        />
        <select name="status" defaultValue={status ?? ''} className="input w-40">
          <option value="">{t('all')}</option>
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('deactivated')}</option>
        </select>
        <button type="submit" className="btn-primary">
          {t('search')}
        </button>
        {(q || status) && <Link href="/admin/users" className="btn-secondary">
            {t('clear')}
          </Link>}
      </form>

      {users.length === 0 ? (
        <p className="card p-8 text-center text-ink-muted">{t('noUsers')}</p>
      ) : (
        <div className="card divide-y divide-surface-border">
          {users.map((u) => {
            // The API enforces both of these too; this only explains why the
            // button is missing instead of letting it fail on click.
            const reason =
              u.id === session.user.id
                ? t('thisIsYou')
                : u.isAdmin
                  ? t('adminChangeInDb')
                  : undefined
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-ink hover:text-brand-600 dark:hover:text-brand-300">
                      {u.displayName}
                    </Link>
                    {u.isAdmin && <span className="badge badge-warn">{t('adminBadge')}</span>}
                    {u.isPro && <span className="badge badge-brand">{t('proBadge')}</span>}
                    {u.isProComped && (
                      <span className="badge badge-success">
                        {u.foundingNumber !== null
                          ? t('foundingNumber', { number: u.foundingNumber })
                          : t('proComped')}
                      </span>
                    )}
                    {!u.active && <span className="badge badge-danger">{t('deactivatedBadge')}</span>}
                  </div>
                  <div className="truncate text-sm text-ink-muted">{u.email}</div>
                  <div className="text-xs text-ink-faint">
                    {t('joined', { date: new Date(u.createdAt).toLocaleDateString('ro-RO') })} ·{' '}
                    {t('vehicleCount', { count: u._count.vehicles })} ·{' '}
                    {t('ticketCount', { count: u._count.tickets })}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
                  <AdminCompProToggle
                    userId={u.id} displayName={u.displayName} isProComped={u.isProComped} isPro={u.isPro}
                  />
                  <AdminUserActiveToggle
                    userId={u.id} displayName={u.displayName} active={u.active} disabledReason={reason}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="btn-secondary">
              {tc('previous')}
            </Link> : <span />}
          <span className="text-ink-muted">{tc('pageOf', { page, total: totalPages })}</span>
          {page < totalPages ? <Link href={qs({ page: String(page + 1) })} className="btn-secondary">
              {tc('next')}
            </Link> : <span />}
        </div>
      )}
    </div>
  )
}
