import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import UpgradePlanCard from '@/components/UpgradePlanCard'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-017: three purchase options — Monthly/Annual (recurring) and
// Lifetime (one-time). Each hits POST /api/billing/checkout and redirects
// to Stripe's hosted Checkout page.
export default async function UpgradePage() {
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (hasPro(user)) redirect('/dashboard/settings')

  const t = await getTranslations('upgrade')

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/settings" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {t('backToSettings')}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        {t('subtitle')}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UpgradePlanCard
          plan="MONTHLY"
          title={t('monthly')}
          price="14.99 RON"
          period={t('monthlyPeriod')}
          description={t('monthlyDescription')}
        />
        <UpgradePlanCard
          plan="ANNUAL"
          title={t('annual')}
          price="99 RON"
          period={t('annualPeriod')}
          description={t('annualDescription')}
          highlight
        />
        <UpgradePlanCard
          plan="LIFETIME"
          title={t('lifetime')}
          price="299 RON"
          period={t('lifetimePeriod')}
          description={t('lifetimeDescription')}
        />
      </div>
    </div>
  )
}
