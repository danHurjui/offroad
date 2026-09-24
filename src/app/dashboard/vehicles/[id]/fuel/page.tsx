import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { consumptionIntervals, fuelSummary, type FuelLike } from '@/lib/fuel'
import { combinedIntervals, combinedSummary } from '@/lib/charging'
import { dayKey } from '@/lib/odometer'
import { serializeFuelEntry, toNumberOrNull } from '@/lib/serialize'
import FuelQuickAdd from '@/components/FuelQuickAdd'
import { FuelRow, RemoveFuelButton } from '@/components/FuelEntryRemove'
import { vehicleHasPro } from '@/lib/entitlement'
import { formatRon } from '@/lib/money'
import { powertrainOf, takesFuel } from '@/lib/powertrain'

const num = (n: number, digits = 2) => n.toLocaleString('ro-RO', { maximumFractionDigits: digits })
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-044: fill-ups, and what they say about consumption.
export default async function FuelPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('fuel')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  // Same rule as the vehicle page's total: a collaborator on a vehicle
  // with hideCostsFromCollaborators set does not see the aggregate spend.
  const hideSpend = hidesCosts(vehicle)

  // RL-048: scanning is Pro — the plan of the vehicle's account of record,
  // like every other Pro feature on a vehicle, so a driver or mechanic on a
  // Pro vehicle can scan too.
  // RL-054: a plug-in hybrid also drove on electricity between two full
  // tanks, so l/100 km alone understates the engine. It gets litres and
  // kWh together, only over stretches both logs cover — never a bare
  // l/100 km (the owner's strict rule on #122).
  const isPluginHybrid = powertrainOf(vehicle.fuelType) === 'PLUGIN_HYBRID'
  const [rows, overrides, canScan, charges] = await Promise.all([
    prisma.fuelEntry.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { odometerReading: { select: { km: true } } },
    }),
    prisma.odometerReading.findMany({ where: { vehicleId: vehicle.id, isOverride: true }, select: { readAt: true } }),
    vehicleHasPro(vehicle),
    isPluginHybrid
      ? prisma.chargeEntry.findMany({
          where: { vehicleId: vehicle.id },
          select: { id: true, date: true, kwh: true, totalRon: true, socTo: true, createdAt: true, odometerReading: { select: { km: true } } },
        })
      : Promise.resolve([]),
  ])
  const entries = rows.map(serializeFuelEntry)
  const fuelLike: FuelLike[] = entries.map((e) => ({
    id: e.id,
    date: e.date,
    litres: e.litres,
    totalRon: e.totalRon,
    isFullTank: e.isFullTank,
    km: e.km,
    createdAt: e.createdAt,
  }))
  const overrideDays = overrides.map((o) => dayKey(o.readAt))
  const summary = fuelSummary(fuelLike, overrideDays)
  const byEnd = new Map(consumptionIntervals(fuelLike, overrideDays).map((i) => [i.endId, i]))
  const combined = isPluginHybrid
    ? combinedIntervals(
        fuelLike,
        charges.map((c) => ({
          id: c.id, date: c.date, km: c.odometerReading?.km ?? null, createdAt: c.createdAt,
          kwh: toNumberOrNull(c.kwh), totalRon: toNumberOrNull(c.totalRon) ?? 0, socTo: c.socTo,
        })),
        overrideDays
      )
    : []
  const combinedTotal = combinedSummary(combined)
  const combinedByEnd = new Map(combined.map((i) => [i.endId, i]))

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>

      {!takesFuel(powertrainOf(vehicle.fuelType)) && (
        <p className="note mb-6 rounded-lg border p-3 text-sm text-ink">
          {t('electric')}{' '}
          <Link href={`/dashboard/vehicles/${vehicle.id}/charging`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            {t('electricLink')}
          </Link>
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isPluginHybrid ? (
          <div className="card p-4">
            <div className="text-xs text-ink-faint">{t('combined')}</div>
            {combinedTotal ? (
              <>
                <div className="text-2xl font-semibold text-ink">
                  {t('combinedValue', { litres: num(combinedTotal.litresPer100Km), kwh: num(combinedTotal.kwhPer100Km) })}
                </div>
                <div className="text-sm text-ink-muted">{t('measuredOver', { km: num(combinedTotal.measuredKm, 0) })}</div>
                {!hideSpend && (
                  <div className="text-sm text-ink-muted">{t('combinedCost', { price: formatRon(combinedTotal.ronPerKm) })}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-ink-muted">{t('combinedNotYet')}</div>
            )}
            <p className="mt-2 text-xs text-ink-faint">{t('combinedWhy')}</p>
          </div>
        ) : (
          <div className="card p-4">
            <div className="text-xs text-ink-faint">{t('average')}</div>
            {summary.averageLitresPer100Km !== null ? (
              <>
                <div className="text-2xl font-semibold text-ink">{t('averageValue', { value: num(summary.averageLitresPer100Km) })}</div>
                <div className="text-sm text-ink-muted">{t('measuredOver', { km: num(summary.measuredKm, 0) })}</div>
                {summary.lastLitresPer100Km !== null && (
                  <div className="text-sm text-ink-muted">{t('last', { value: num(summary.lastLitresPer100Km) })}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-ink-muted">{t('notYet')}</div>
            )}
          </div>
        )}
        <div className="card p-4">
          <div className="text-xs text-ink-faint">{t('spent')}</div>
          <div className="text-2xl font-semibold text-ink">{hideSpend ? t('hidden') : formatRon(summary.totalRon)}</div>
          <div className="text-sm text-ink-muted">{t('litresTotal', { litres: num(summary.totalLitres), fills: summary.fills })}</div>
        </div>
      </div>

      <div className="card mb-6 p-4">
        <FuelQuickAdd vehicleId={vehicle.id} canScan={canScan} offerScanUpgrade={isOwner && !vehicle.organizationId} />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('history')}</h2>
      {entries.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="card divide-y divide-surface-border">
          {entries.map((e) => {
            const interval = byEnd.get(e.id)
            return (
              <FuelRow key={e.id} entryId={e.id}>
                <li className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{num(e.litres)} l</span>
                      <span className="text-ink">· {formatRon(e.totalRon)}</span>
                      {e.pricePerLitre !== null && (
                        <span className="text-sm text-ink-muted">({t('perLitre', { price: num(e.pricePerLitre, 3) })})</span>
                      )}
                      {!e.isFullTank && <span className="badge badge-neutral">{t('partial')}</span>}
                    </div>
                    <div className="text-sm text-ink-muted">
                      {fmtDate(e.date)}
                      {e.km !== null && ` · ${num(e.km, 0)} km`}
                      {e.station && ` · ${e.station}`}
                    </div>
                    {!isPluginHybrid && interval && (
                      <div className="mt-1 text-sm text-ink">{t('consumption', { value: num(interval.litresPer100Km) })}</div>
                    )}
                    {isPluginHybrid && combinedByEnd.has(e.id) && (
                      <div className="mt-1 text-sm text-ink">
                        {t('combinedSince', {
                          litres: num(combinedByEnd.get(e.id)!.litresPer100Km),
                          kwh: num(combinedByEnd.get(e.id)!.kwhPer100Km),
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {e.receiptUrl && (
                      <a href={`/api/uploads/${e.receiptUrl}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline dark:text-brand-300">
                        {t('viewReceipt')}
                      </a>
                    )}
                    {(isOwner || e.createdByUserId === session.user.id) && (
                      <RemoveFuelButton vehicleId={vehicle.id} entryId={e.id} dateLabel={fmtDate(e.date)} />
                    )}
                  </div>
                </li>
              </FuelRow>
            )
          })}
        </ul>
      )}
    </div>
  )
}
