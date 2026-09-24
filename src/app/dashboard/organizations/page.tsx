import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import OrganizationForm from '@/components/OrganizationForm'
import { canCreateOrganization } from '@/lib/organizations'
import { isOrgBillingConfigured } from '@/lib/stripe'

// RL-038: the organisations this account belongs to, and — for an account
// in the closed beta — the form that creates one.
export default async function OrganizationsPage() {
  const t = await getTranslations('organizations')
  const tc = await getTranslations('common')
  const ts = await getTranslations('settings')
  const session = await requireSessionOrRedirect()
  const [user, memberships] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { orgBetaAt: true, isAdmin: true } }),
    prisma.organizationMember.findMany({
      where: { userId: session.user.id },
      include: { organization: { include: { _count: { select: { members: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/settings" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: ts('title') })}
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>

      {memberships.length === 0 ? (
        <p className="card mb-6 p-4 text-sm text-ink-faint">{t('none')}</p>
      ) : (
        <ul className="card mb-6 divide-y divide-surface-border">
          {memberships.map((m) => (
            <li key={m.id}>
              <Link href={`/dashboard/organizations/${m.organization.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface-muted">
                <span className="min-w-0 truncate text-sm font-medium text-ink">{m.organization.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                  {t('memberCount', { count: m.organization._count.members })}
                  <span className="badge bg-surface-subtle text-ink-muted">{t(`role.${m.role}`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">{t('createTitle')}</h2>
        {canCreateOrganization(user, isOrgBillingConfigured()) ? (
          <>
            <p className="mb-3 text-xs text-ink-muted">{t('createHelp')}</p>
            <OrganizationForm />
          </>
        ) : (
          <p className="text-sm text-ink-muted">{t('betaNote')}</p>
        )}
      </section>
    </div>
  )
}
