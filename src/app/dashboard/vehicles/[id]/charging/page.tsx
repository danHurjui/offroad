import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { chargeSummary } from '@/lib/charging'
import { serializeChargeEntry, toNumberOrNull } from '@/lib/serialize'
import ChargeQuickAdd from '@/components/ChargeQuickAdd'
import HomeTariffForm from '@/components/HomeTariffForm'
import { ChargeRow, RemoveChargeButton } from '@/components/ChargeEntryRemove'
import { formatRon } from '@/lib/money'
import { powertrainOf, takesCharge } from '@/lib/powertrain'

const num = (n: number, digits = 2) => n.toLocaleString('ro-RO', { maximumFractionDigits: digits })
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-053 (#121): charges, for a vehicle that plugs in.
export default async function ChargingPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('charging')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  const hideSpend = hidesCosts(vehicle)
  const tariff = toNumberOrNull(vehicle.homeTariffRonPerKwh)

  const rows = await prisma.chargeEntry.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    include: { odometerReading: { select: { km: true } } },
  })
  const entries = rows.map(serializeChargeEntry)
  const summary = chargeSummary(entries)

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>

      {/* Hidden, never cleared: a fuel type corrected after charges were
          logged keeps them, and says why the page is still here. */}
      {!takesCharge(powertrainOf(vehicle.fuelType)) && (
        <p className="note mb-6 rounded-lg border p-3 text-sm text-ink">{t('notPlugIn')}</p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <div className="text-xs text-ink-faint">{t('spent')}</div>
          <div className="text-2xl font-semibold text-ink">{hideSpend ? t('hidden') : formatRon(summary.totalRon)}</div>
          <div className="text-sm text-ink-muted">{t('kwhTotal', { kwh: num(summary.totalKwh), charges: summary.charges })}</div>
          {summary.withoutKwh > 0 && <div className="text-sm text-ink-muted">{t('withoutKwh', { count: summary.withoutKwh })}</div>}
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-faint">{t('averagePrice')}</div>
          {hideSpend ? (
            <div className="text-2xl font-semibold text-ink">{t('hidden')}</div>
          ) : summary.averagePricePerKwh !== null ? (
            <>
              <div className="text-2xl font-semibold text-ink">{t('perKwh', { price: num(summary.averagePricePerKwh, 3) })}</div>
              <div className="text-sm text-ink-muted">{t('averagePriceHelp')}</div>
            </>
          ) : (
            <div className="text-sm text-ink-muted">{t('averagePriceNotYet')}</div>
          )}
        </div>
      </div>

      <div className="card mb-6 p-4">
        <ChargeQuickAdd vehicleId={vehicle.id} hasHomeTariff={tariff !== null} />
      </div>

      {isOwner && (
        <div className="card mb-6 p-4">
          <HomeTariffForm vehicleId={vehicle.id} tariff={tariff} />
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('history')}</h2>
      {entries.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="card divide-y divide-surface-border">
          {entries.map((e) => (
            <ChargeRow key={e.id} entryId={e.id}>
              <li className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{e.kwh !== null ? `${num(e.kwh)} kWh` : t('noKwh')}</span>
                    {!hideSpend && (
                      <span className="text-ink">· {e.totalRon === 0 ? t('free') : formatRon(e.totalRon)}</span>
                    )}
                    {!hideSpend && e.pricePerKwh !== null && e.totalRon > 0 && (
                      <span className="text-sm text-ink-muted">({t('perKwh', { price: num(e.pricePerKwh, 3) })})</span>
                    )}
                    <span className="badge badge-neutral">{t(`where.${e.location}`)}</span>
                    {!hideSpend && e.totalFromTariff && <span className="badge badge-info">{t('fromTariff')}</span>}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {fmtDate(e.date)}
                    {e.km !== null && ` · ${num(e.km, 0)} km`}
                    {e.network && ` · ${e.network}`}
                    {(e.socFrom !== null || e.socTo !== null) &&
                      ` · ${t('socRange', { from: e.socFrom ?? '?', to: e.socTo ?? '?' })}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {e.receiptUrl && (
                    <a href={`/api/uploads/${e.receiptUrl}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline dark:text-brand-300">
                      {t('viewReceipt')}
                    </a>
                  )}
                  {(isOwner || e.createdByUserId === session.user.id) && (
                    <RemoveChargeButton vehicleId={vehicle.id} entryId={e.id} dateLabel={fmtDate(e.date)} />
                  )}
                </div>
              </li>
            </ChargeRow>
          ))}
        </ul>
      )}
    </div>
  )
}
