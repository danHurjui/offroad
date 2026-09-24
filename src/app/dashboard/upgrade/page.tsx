import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import UpgradePlanCard from '@/components/UpgradePlanCard'
import CompanyPlans from '@/components/CompanyPlans'
import { hasPro, proKind } from '@/lib/pro'
import { formatPlanPrice, isGrandfathered, LADDER, PLAN_SELECT } from '@/lib/plans'
import { isPersonalPlanOnSale } from '@/lib/stripe'

// RL-017 / RL-042 (#54): Personal, three ways — monthly and annual
// (recurring) and Lifetime (once) — each through POST /api/billing/checkout
// to Stripe's hosted Checkout. The company plans are shown, not sold.
//
// Somebody who already has Personal (or kept Pro from before the ladder)
// is never offered it again: they see what they hold and the company plans
// above it, nothing that would be the same or less.
//
// While payments are held off (no legal entity yet — #96/#97) the prices
// still show, marked "not on sale yet", instead of a button that can only
// answer "payments unavailable".
export default async function UpgradePage() {
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { ...PLAN_SELECT } })
  const t = await getTranslations('upgrade')
  const locale = await getLocale()
  const price = (ron: number) => `${formatPlanPrice(ron, locale)} RON`
  const personal = LADDER.PERSONAL
  const holds = hasPro(user)
  const onSale = {
    PERSONAL_MONTHLY: isPersonalPlanOnSale('PERSONAL_MONTHLY'),
    PERSONAL_ANNUAL: isPersonalPlanOnSale('PERSONAL_ANNUAL'),
    PERSONAL_LIFETIME: isPersonalPlanOnSale('PERSONAL_LIFETIME'),
  }
  const anyOnSale = Object.values(onSale).some(Boolean)

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/settings" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {t('backToSettings')}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('subtitle', { vehicles: personal.vehicles })}</p>

      {holds ? (
        <div className="card mb-6 p-5 text-sm text-ink">
          {isGrandfathered(user)
            ? t('holdsGrandfathered')
            : proKind(user) === 'comped'
              ? t('holdsComped', { vehicles: personal.vehicles })
              : t('holdsPersonal', { vehicles: personal.vehicles })}
        </div>
      ) : (
        <>
        {!anyOnSale && <p className="note-warn mb-4 rounded-lg p-3 text-sm">{t('notOnSale')}</p>}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UpgradePlanCard
            plan="PERSONAL_MONTHLY"
            onSale={onSale.PERSONAL_MONTHLY}
            title={t('monthly')}
            price={price(personal.monthlyRon)}
            period={t('monthlyPeriod')}
            description={t('monthlyDescription')}
          />
          <UpgradePlanCard
            plan="PERSONAL_ANNUAL"
            onSale={onSale.PERSONAL_ANNUAL}
            title={t('annual')}
            price={price(personal.annualRon)}
            period={t('annualPeriod')}
            description={t('annualDescription', { months: Math.round((personal.annualRon / personal.monthlyRon) * 10) / 10 })}
            highlight
          />
          <UpgradePlanCard
            plan="PERSONAL_LIFETIME"
            onSale={onSale.PERSONAL_LIFETIME}
            title={t('lifetime')}
            price={price(personal.lifetimeRon ?? 0)}
            period={t('lifetimePeriod')}
            description={t('lifetimeDescription')}
          />
        </div>
        </>
      )}

      <CompanyPlans signedIn />
    </div>
  )
}
