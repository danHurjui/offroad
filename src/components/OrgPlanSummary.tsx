import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { isOrgPlanId, ORG_PLANS, orgVehicleLimit } from '@/lib/plans'
import EditableVehiclesPicker, { type PickerVehicle } from './EditableVehiclesPicker'

/**
 * RL-042 slice 3: the organisation's plan in one card — what it is, how
 * many vehicles it holds against its allowance, and anything wrong (a
 * failed payment, no plan, vehicles over the allowance and so read-only).
 * On the organisation page for everyone who manages vehicles; the link to
 * billing is the OWNERs' alone. With `choice`, a manager picks which
 * vehicles stay editable while there are more than the plan covers.
 */
export default async function OrgPlanSummary({
  org,
  vehicleCount,
  readOnlyCount,
  isOwner,
  linkToBilling = true,
  choice,
}: {
  org: { id: string; plan: string | null; compedAt: Date | null; paymentFailedAt: Date | null }
  vehicleCount: number
  readOnlyCount: number
  isOwner: boolean
  /** Off on the billing page itself. */
  linkToBilling?: boolean
  /** Every company vehicle, ticked where editable now. */
  choice?: PickerVehicle[]
}) {
  const t = await getTranslations('orgBilling')
  const te = await getTranslations('editableChoice')
  const limit = orgVehicleLimit(org)
  const plan = isOrgPlanId(org.plan) ? ORG_PLANS[org.plan] : null

  return (
    <section className="card mb-6 space-y-2 p-5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">{t('planTitle')}</h2>
        {isOwner && linkToBilling && (
          <Link href={`/dashboard/organizations/${org.id}/billing`} className="text-brand-600 hover:underline dark:text-brand-300">
            {t('billingLink')}
          </Link>
        )}
      </div>
      <p className="text-ink">
        {org.compedAt
          ? t('comped')
          : plan
            ? t('onPlan', { plan: t(`tier.${plan.tier}`), period: t(`period.${plan.period}`) })
            : t('noPlan')}
      </p>
      <p className="text-ink-muted">
        {limit === null ? t('vehiclesUncapped', { count: vehicleCount }) : t('vehiclesOf', { count: vehicleCount, limit })}
      </p>
      {org.paymentFailedAt && <p className="note-warn rounded-lg p-3">{isOwner ? t('paymentFailedOwner') : t('paymentFailed')}</p>}
      {readOnlyCount > 0 && (
        <p className="note-warn rounded-lg p-3">{t('readOnlyCount', { count: readOnlyCount })}</p>
      )}
      {choice && readOnlyCount > 0 && limit !== null && limit > 0 && (
        <EditableVehiclesPicker
          endpoint={`/api/organizations/${org.id}/editable-vehicles`}
          max={limit}
          help={te('helpOrg', { limit })}
          vehicles={choice}
        />
      )}
      {!org.compedAt && !plan && !isOwner && <p className="text-xs text-ink-faint">{t('ownerChooses')}</p>}
    </section>
  )
}
