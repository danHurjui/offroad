import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import { isOrgPlanId, ORG_PLANS } from '@/lib/plans'
import AdminOrgCompToggle from '@/components/AdminOrgCompToggle'

export const metadata: Metadata = { title: 'Organisations — RigLog admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

// RL-038: every organisation — who owns it, how many members and vehicles
// it has, what it pays — and which accounts have the beta switched on.
// `isAdmin` moderates and grants no access to anybody's vehicles or
// records, so nothing here links into an organisation's own screens.
// Counts only, never vehicle details. The one change it makes is the comp
// (RL-042), through PATCH /api/admin/organizations/[orgId].
export default async function AdminOrganizationsPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const t = await getTranslations('admin')
  const tr = await getTranslations('organizations')
  const tc = await getTranslations('common')
  const tb = await getTranslations('orgBilling')
  await requireAdminOrNotFound()
  const q = searchParams.q?.trim() ?? ''
  const page = Math.max(1, Number(searchParams.page) || 1)
  const where = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { cui: { contains: q, mode: 'insensitive' as const } }] }
    : {}

  const [organizations, total, betaUsers] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        cui: true,
        createdAt: true,
        plan: true,
        compedAt: true,
        _count: { select: { members: true, vehicles: true } },
        members: {
          where: { role: 'OWNER' },
          orderBy: { createdAt: 'asc' },
          select: { user: { select: { id: true, displayName: true, email: true } } },
        },
      },
    }),
    prisma.organization.count({ where }),
    prisma.user.findMany({
      where: { orgBetaAt: { not: null } },
      orderBy: { orgBetaAt: 'desc' },
      take: 50,
      select: { id: true, displayName: true, email: true, orgBetaAt: true },
    }),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageHref = (n: number) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (n > 1) p.set('page', String(n))
    const out = p.toString()
    return out ? `/admin/organizations?${out}` : '/admin/organizations'
  }
  const date = (d: Date) => d.toLocaleDateString('ro-RO')

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{t('organizations')}</h1>
        <span className="text-sm text-ink-muted">{t('total', { count: total })}</span>
      </div>
      <p className="mb-6 text-sm text-ink-muted">{t('organizationsIntro')}</p>

      <form className="card mb-4 flex flex-wrap gap-3 p-4" method="get">
        <input type="text" name="q" defaultValue={q} placeholder={t('searchOrganizations')} className="input min-w-48 flex-1" />
        <button type="submit" className="btn-primary">{t('search')}</button>
        {q && <Link href="/admin/organizations" className="btn-secondary">{t('clear')}</Link>}
      </form>

      {organizations.length === 0 ? (
        <p className="card mb-8 p-8 text-center text-ink-muted">{t('noOrganizations')}</p>
      ) : (
        <div className="card mb-4 divide-y divide-surface-border">
          {organizations.map((org) => (
            <div key={org.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{org.name}</span>
                  {org.cui && <span className="badge bg-surface-subtle text-ink-muted">{org.cui}</span>}
                  {org.compedAt ? (
                    <span className="badge badge-success">{t('orgComped')}</span>
                  ) : isOrgPlanId(org.plan) ? (
                    <span className="badge badge-info">
                      {t('orgPlanBadge', { plan: tb(`tier.${ORG_PLANS[org.plan].tier}`), limit: ORG_PLANS[org.plan].vehicles })}
                    </span>
                  ) : (
                    <span className="badge badge-warn">{t('orgNoPlan')}</span>
                  )}
                </div>
                <div className="text-xs text-ink-faint">
                  {t('orgCreated', { date: date(org.createdAt) })} · {t('memberCount', { count: org._count.members })} ·{' '}
                  {t('vehicleCount', { count: org._count.vehicles })}
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  {tr('role.OWNER')}:{' '}
                  {org.members.map((m, i) => (
                    <span key={m.user.id}>
                      {i > 0 && ', '}
                      <Link href={`/admin/users/${m.user.id}`} className="text-ink hover:text-brand-600 dark:hover:text-brand-300">
                        {m.user.displayName}
                      </Link>{' '}
                      <span className="text-ink-faint">({m.user.email})</span>
                    </span>
                  ))}
                </div>
              </div>
              <AdminOrgCompToggle orgId={org.id} name={org.name} comped={org.compedAt !== null} />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mb-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="btn-secondary">{tc('previous')}</Link> : <span />}
          <span className="text-ink-muted">{tc('pageOf', { page, total: totalPages })}</span>
          {page < totalPages ? <Link href={pageHref(page + 1)} className="btn-secondary">{tc('next')}</Link> : <span />}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-ink">{t('orgBetaAccounts')}</h2>
        <p className="mb-3 text-sm text-ink-muted">{t('orgBetaAccountsHelp')}</p>
        {betaUsers.length === 0 ? (
          <p className="card p-4 text-sm text-ink-muted">{t('orgBetaNone')}</p>
        ) : (
          <ul className="card divide-y divide-surface-border">
            {betaUsers.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-ink hover:text-brand-600 dark:hover:text-brand-300">
                    {u.displayName}
                  </Link>{' '}
                  <span className="text-ink-faint">({u.email})</span>
                </span>
                <span className="text-xs text-ink-faint">{u.orgBetaAt && date(u.orgBetaAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
