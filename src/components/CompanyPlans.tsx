import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { formatPlanPrice, LADDER, type TierId } from '@/lib/plans'
import { isOrgBillingConfigured } from '@/lib/stripe'

const COMPANY_TIERS: TierId[] = ['PRO', 'BUSINESS', 'FLEET']

/**
 * RL-042 (#54): the company rungs of the ladder — Pro, Business, Fleet —
 * with their prices and allowances from `LADDER`. Shown on the homepage
 * and the upgrade page. An organisation buys them (slice 3); until every
 * company Price is configured they are marked "coming soon", matching the
 * closed beta that is still on then.
 */
export default async function CompanyPlans({ signedIn = false }: { signedIn?: boolean }) {
  const open = isOrgBillingConfigured()
  const t = await getTranslations('plans')
  const locale = await getLocale()
  const price = (ron: number) => formatPlanPrice(ron, locale)

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">{t('companyTitle')}</h3>
        {!open && <span className="badge bg-surface-subtle text-ink-muted">{t('companySoon')}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{open ? t('companyIntroOpen') : t('companyIntro')}</p>
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
      {open && (
        <Link href={signedIn ? '/dashboard/organizations' : '/register'} className="btn-secondary mt-4 w-full">
          {t('companyStart')}
        </Link>
      )}
    </div>
  )
}
