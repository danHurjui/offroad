import { getLocale, getTranslations } from 'next-intl/server'
import { formatPlanPrice, LADDER, type TierId } from '@/lib/plans'

const COMPANY_TIERS: TierId[] = ['PRO', 'BUSINESS', 'FLEET']

/**
 * RL-042 (#54): the company rungs of the ladder — Pro, Business, Fleet —
 * with their prices and allowances from `LADDER`. Shown on the homepage
 * and the upgrade page, marked as not on sale yet: organisations are still
 * the closed beta, and their billing ships separately.
 */
export default async function CompanyPlans() {
  const t = await getTranslations('plans')
  const locale = await getLocale()
  const price = (ron: number) => formatPlanPrice(ron, locale)

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">{t('companyTitle')}</h3>
        <span className="badge bg-surface-subtle text-ink-muted">{t('companySoon')}</span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t('companyIntro')}</p>
      <ul className="mt-4 divide-y divide-surface-border text-sm">
        {COMPANY_TIERS.map((id) => {
          const tier = LADDER[id]
          return (
            <li key={id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{t(`name.${id}`)}</span>
                <span className="font-medium text-ink">
                  {tier.steps.length > 0
                    ? t('priceFrom', { price: price(tier.monthlyRon) })
                    : t('priceMonth', { price: price(tier.monthlyRon) })}
                </span>
              </div>
              <div className="text-xs text-ink-muted">
                {tier.steps.length > 0
                  ? tier.steps.map((step) => t('fleetStep', { count: step.vehicles, price: price(step.monthlyRon) })).join(' · ')
                  : t('vehiclesUpTo', { count: tier.vehicles })}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-faint">{t('annualNote')}</p>
    </div>
  )
}
