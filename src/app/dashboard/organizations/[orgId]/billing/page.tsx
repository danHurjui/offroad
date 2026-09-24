import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { canManageOrganization } from '@/lib/organizations'
import { formatPlanPrice, ORG_PLAN_IDS, ORG_PLANS } from '@/lib/plans'
import { isOrgBillingConfigured } from '@/lib/stripe'
import { orgReadOnlyVehicleIds } from '@/lib/vehicleAllowance'
import OrgPlanSummary from '@/components/OrgPlanSummary'
import OrgPlanPicker, { OrgBillingPortalButton, type PickerPlan } from '@/components/OrgPlanPicker'

type Params = { params: { orgId: string }; searchParams: { subscribed?: string; canceled?: string } }

// RL-042 slice 3: the organisation's plan and billing. OWNERs only — a
// fleet manager runs the fleet and does not hold the card; anyone else
// gets a 404, as for every organisation screen they cannot use.
export default async function OrganizationBillingPage({ params, searchParams }: Params) {
  const t = await getTranslations('orgBilling')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const session = await requireSessionOrRedirect()
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.orgId, userId: session.user.id } },
    include: { organization: true },
  })
  if (!membership || !canManageOrganization(membership.role)) notFound()
  const org = membership.organization

  const [vehicleCount, readOnly] = await Promise.all([
    prisma.vehicle.count({ where: { organizationId: org.id } }),
    orgReadOnlyVehicleIds(org.id),
  ])
  const plans: PickerPlan[] = ORG_PLAN_IDS.map((id) => {
    const p = ORG_PLANS[id]
    return { id, tier: p.tier, period: p.period, vehicles: p.vehicles, price: formatPlanPrice(p.priceRon, locale) }
  })
  const configured = isOrgBillingConfigured()

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/organizations/${org.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300">
        {tc('backTo', { screen: org.name })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>

      {searchParams.subscribed && <p className="note-warn mb-4 rounded-lg p-3 text-sm">{t('subscribed')}</p>}

      <OrgPlanSummary org={org} vehicleCount={vehicleCount} readOnlyCount={readOnly.size} isOwner linkToBilling={false} />

      {org.stripeSubscriptionId ? (
        <section className="card mb-6 space-y-3 p-5 text-sm">
          <p className="text-ink-muted">{t('manageHelp')}</p>
          <OrgBillingPortalButton orgId={org.id} />
        </section>
      ) : org.compedAt ? null : configured ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('chooseTitle')}</h2>
          <p className="mb-3 text-xs text-ink-faint">{t('chooseHelp')}</p>
          <OrgPlanPicker orgId={org.id} plans={plans} />
        </section>
      ) : (
        <p className="card mb-6 p-4 text-sm text-ink-muted">{t('notConfigured')}</p>
      )}

      {org.stripeCustomerId && !org.stripeSubscriptionId && (
        <section className="card p-5 text-sm">
          <p className="mb-3 text-ink-muted">{t('invoicesHelp')}</p>
          <OrgBillingPortalButton orgId={org.id} />
        </section>
      )}
    </div>
  )
}
