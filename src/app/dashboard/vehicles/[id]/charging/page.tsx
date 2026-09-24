import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { chargeIntervals, chargeSummary, isChargeLocation, type ChargeMeasurable } from '@/lib/charging'
import { summarize } from '@/lib/consumption'
import { dayKey } from '@/lib/odometer'
import { serializeChargeEntry, toNumberOrNull } from '@/lib/serialize'
import ChargeQuickAdd from '@/components/ChargeQuickAdd'
import HomeTariffForm from '@/components/HomeTariffForm'
import { ChargeItem, ChargeRow } from '@/components/ChargeEntryRemove'
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

  const [rows, overrides] = await Promise.all([
    prisma.chargeEntry.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { odometerReading: { select: { km: true } } },
    }),
    prisma.odometerReading.findMany({ where: { vehicleId: vehicle.id, isOverride: true }, select: { readAt: true } }),
  ])
  const entries = rows.map(serializeChargeEntry)
  const summary = chargeSummary(entries)
  // RL-054: kWh/100 km only for a vehicle that runs on electricity alone.
  // A plug-in hybrid also burnt fuel over the same km, so its figure is the
  // combined one on the fuel page, never kWh/100 km on its own here.
  const powertrain = powertrainOf(vehicle.fuelType)
  const measurable: ChargeMeasurable[] = entries.map((e) => ({
    id: e.id, date: e.date, km: e.km, createdAt: e.createdAt, kwh: e.kwh, totalRon: e.totalRon, socTo: e.socTo,
  }))
  const intervals = powertrain === 'ELECTRIC' ? chargeIntervals(measurable, overrides.map((o) => dayKey(o.readAt))) : []
  const consumption = summarize(intervals)
  const byEnd = new Map(intervals.map((i) => [i.endId, i]))

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>

      {/* Hidden, never cleared: a fuel type corrected after charges were
          logged keeps them, and says why the page is still here. */}
      {!takesCharge(powertrain) && (
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

      {powertrain === 'ELECTRIC' && (
        <div className="card mb-6 p-4">
          <div className="text-xs text-ink-faint">{t('consumption')}</div>
          {consumption.averagePer100Km !== null ? (
            <>
              <div className="text-2xl font-semibold text-ink">{t('consumptionValue', { value: num(consumption.averagePer100Km) })}</div>
              <div className="text-sm text-ink-muted">
                {t('consumptionMeasured', { km: num(consumption.measuredKm, 0), intervals: consumption.intervals })}
              </div>
              {consumption.lastPer100Km !== null && (
                <div className="text-sm text-ink-muted">{t('consumptionLast', { value: num(consumption.lastPer100Km) })}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-ink-muted">{t('consumptionNotYet')}</div>
          )}
          <p className="mt-2 text-xs text-ink-faint">{t('atThePlug')}</p>
        </div>
      )}
      {powertrain === 'PLUGIN_HYBRID' && (
        <p className="note mb-6 rounded-lg border p-3 text-sm text-ink">
          {t('pluginHybridConsumption')}{' '}
          <Link href={`/dashboard/vehicles/${vehicle.id}/fuel`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            {t('pluginHybridConsumptionLink')}
          </Link>
        </p>
      )}

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
              <ChargeItem
                vehicleId={vehicle.id}
                entry={{
                  id: e.id,
                  totalRon: hideSpend ? null : e.totalRon,
                  totalFromTariff: e.totalFromTariff,
                  kwh: e.kwh,
                  km: e.km,
                  location: isChargeLocation(e.location) ? e.location : 'OTHER',
                  date: e.date.toISOString().slice(0, 10),
                  network: e.network,
                  socFrom: e.socFrom,
                  socTo: e.socTo,
                }}
                dateLabel={fmtDate(e.date)}
                receiptUrl={e.receiptUrl}
                canChange={isOwner || e.createdByUserId === session.user.id}
                hasHomeTariff={tariff !== null}
                hideCosts={hideSpend}
              >
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
                    {e.socFrom !== null && e.socTo !== null && ` · ${t('socRange', { from: e.socFrom, to: e.socTo })}`}
                    {e.socFrom === null && e.socTo !== null && ` · ${t('socToOnly', { to: e.socTo })}`}
                    {e.socFrom !== null && e.socTo === null && ` · ${t('socFromOnly', { from: e.socFrom })}`}
                  </div>
                  {byEnd.has(e.id) && (
                    <div className="mt-1 text-sm text-ink">
                      {t('consumptionSince', { value: num(byEnd.get(e.id)!.per100Km), level: e.socTo ?? 0 })}
                    </div>
                  )}
              </ChargeItem>
            </ChargeRow>
          ))}
        </ul>
      )}
    </div>
  )
}
