import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { currentReading } from '@/lib/odometer'
import { loadReadings } from '@/lib/odometerRecords'
import { currentMonth, energySplit, parseMonth, reconcileMonth, shiftMonth, sortTrips, tripDistance } from '@/lib/trips'
import { loadMonthTrips, tripGate } from '@/lib/tripRecords'
import { formatRon } from '@/lib/money'
import TripForm from '@/components/TripForm'
import { RemoveTripButton, TripRow } from '@/components/TripRemove'

const km = (n: number) => n.toLocaleString('ro-RO')
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

type Params = { params: { id: string }; searchParams: { month?: string } }

// RL-051: the vehicle's trips for a month — the trip sheet. A manager sees
// every trip, the odometer reconciliation (the km no trip accounts for)
// and the month's fuel divided by distance; a driver sees and exports only
// their own trips.
export default async function TripsPage({ params, searchParams }: Params) {
  const t = await getTranslations('trips')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const gate = await tripGate(vehicle)
  if (gate === 'forbidden') notFound()

  const back = (
    <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300">
      {tc('backTo', { screen: `${vehicle.make} ${vehicle.model}` })}
    </Link>
  )
  if (gate === 'upgrade') {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
        <div className="card p-5">
          <p className="mb-3 text-sm text-ink-muted">{t('pro')}</p>
          <Link href="/dashboard/upgrade" className="btn-primary">{t('upgrade')}</Link>
        </div>
      </div>
    )
  }

  const manager = vehicle.access === 'owner'
  const month = parseMonth(searchParams.month) ?? currentMonth()
  const [trips, readings, members, fuel, charging] = await Promise.all([
    loadMonthTrips({ vehicleIds: [vehicle.id], month, ...(manager ? {} : { driverUserId: session.user.id }) }),
    loadReadings(vehicle.id),
    manager && vehicle.organizationId
      ? prisma.organizationMember.findMany({
          where: { organizationId: vehicle.organizationId },
          select: { user: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    manager && !hidesCosts(vehicle)
      ? prisma.fuelEntry.aggregate({ where: { vehicleId: vehicle.id, date: { gte: month.from, lt: month.end } }, _sum: { totalRon: true } })
      : Promise.resolve(null),
    // RL-055: charging is energy too, or an EV's split would always be empty.
    manager && !hidesCosts(vehicle)
      ? prisma.chargeEntry.aggregate({ where: { vehicleId: vehicle.id, date: { gte: month.from, lt: month.end } }, _sum: { totalRon: true } })
      : Promise.resolve(null),
  ])
  const sorted = sortTrips(trips)
  const reconciliation = manager ? reconcileMonth(trips, readings, month) : null
  const split =
    reconciliation && fuel && charging
      ? energySplit(fuel._sum.totalRon?.toNumber() ?? 0, charging._sum.totalRon?.toNumber() ?? 0, reconciliation)
      : null
  const byId = new Map(sorted.map((trip) => [trip.id, trip]))
  const tripLabel = (id: string | null) => {
    const trip = id ? byId.get(id) : null
    return trip ? `${fmtDate(trip.date)} ${trip.fromPlace} → ${trip.toPlace}` : null
  }
  const lastKm = currentReading(readings)?.km ?? null
  const drivers = members.map((m) => ({ id: m.user.id, name: m.user.displayName }))
  const ownDistance = (kind: string) => sorted.filter((x) => x.kind === kind).reduce((s, x) => s + (tripDistance(x) ?? 0), 0)
  const monthName = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month.from)
  const href = (key: string) => `/dashboard/vehicles/${vehicle.id}/trips?month=${key}`

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-2 text-sm text-ink-muted">{manager ? t('intro') : t('introDriver')}</p>
      <p className="note-warn mb-6 rounded-lg p-3 text-xs">{t('notOfficial')}</p>

      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">{t('addTitle')}</h2>
        <TripForm vehicleId={vehicle.id} lastKm={lastKm} drivers={drivers} selfId={session.user.id} />
      </section>

      <nav className="mb-4 flex items-center justify-between gap-2" aria-label={t('monthNav')}>
        <Link href={href(shiftMonth(month, -1).key)} className="btn-secondary">← {t('previous')}</Link>
        <span className="font-medium capitalize text-ink">{monthName}</span>
        <Link href={href(shiftMonth(month, 1).key)} className="btn-secondary">{t('next')} →</Link>
      </nav>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{t('kind.BUSINESS')}</div>
          <div className="mt-1 text-lg font-bold text-ink">{km(reconciliation?.business ?? ownDistance('BUSINESS'))} km</div>
        </div>
        <div className="card p-3">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{t('kind.PERSONAL')}</div>
          <div className="mt-1 text-lg font-bold text-ink">{km(reconciliation?.personal ?? ownDistance('PERSONAL'))} km</div>
        </div>
        {reconciliation && (
          <>
            <div className="card p-3">
              <div className="text-xs uppercase tracking-wide text-ink-faint">{t('odometerTile')}</div>
              <div className="mt-1 text-lg font-bold text-ink">{reconciliation.odometer ? `${km(reconciliation.odometer.km)} km` : '—'}</div>
            </div>
            <div className={`card p-3 ${reconciliation.unlogged ? 'note-warn' : ''}`}>
              <div className="text-xs uppercase tracking-wide text-ink-faint">{t('unloggedTile')}</div>
              <div className="mt-1 text-lg font-bold text-ink">{reconciliation.unlogged === null ? '—' : `${km(reconciliation.unlogged)} km`}</div>
            </div>
          </>
        )}
      </div>

      {reconciliation && (
        <section className="card mb-6 space-y-2 p-4 text-sm">
          <h2 className="font-semibold text-ink">{t('reconcileTitle')}</h2>
          {reconciliation.odometer ? (
            <p className="text-ink-muted">
              {t('odometerSpan', {
                from: km(reconciliation.odometer.fromKm),
                fromDate: fmtDate(reconciliation.odometer.fromDate),
                to: km(reconciliation.odometer.toKm),
                toDate: fmtDate(reconciliation.odometer.toDate),
              })}
            </p>
          ) : (
            <p className="text-ink-muted">{t('noOdometer')}</p>
          )}
          {reconciliation.gaps.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-ink">
              {reconciliation.gaps.map((gap, i) => {
                const after = tripLabel(gap.afterTripId)
                const before = tripLabel(gap.beforeTripId)
                const where = after && before ? t('gapBetween', { after, before }) : after ? t('gapAfter', { after }) : t('gapBefore', { before: before ?? '' })
                return (
                  <li key={i}>
                    {gap.km === null ? t('gapUnknown', { where }) : gap.km < 0 ? t('gapOverlap', { where, km: km(-gap.km) }) : t('gapKm', { where, km: km(gap.km) })}
                  </li>
                )
              })}
            </ul>
          )}
          {reconciliation.withoutDistance > 0 && <p className="text-ink-muted">{t('withoutDistance', { count: reconciliation.withoutDistance })}</p>}
          {split && (
            <p className="text-ink-muted">
              {t(split.chargeRon === 0 ? 'energySplit.fuel' : split.fuelRon === 0 ? 'energySplit.charging' : 'energySplit.both', {
                energy: formatRon(split.energyRon),
                perKm: formatRon(split.perKm),
                business: formatRon(split.business),
                personal: formatRon(split.personal),
                unlogged: formatRon(split.unlogged),
              })}
            </p>
          )}
        </section>
      )}

      {sorted.length === 0 ? (
        <p className="card p-4 text-sm text-ink-faint">{t('empty')}</p>
      ) : (
        <ul className="card mb-4 divide-y divide-surface-border">
          {sorted.map((trip) => {
            const distance = tripDistance(trip)
            const mayRemove = manager || trip.driverUserId === session.user.id
            return (
              <TripRow key={trip.id} tripId={trip.id}>
                <li className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">
                      {fmtDate(trip.date)} · {trip.fromPlace} → {trip.toPlace}
                    </div>
                    <div className="text-xs text-ink-muted">
                      <span className={`badge mr-1 ${trip.kind === 'BUSINESS' ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}>{t(`kind.${trip.kind}`)}</span>
                      {trip.purpose && <span>{trip.purpose} · </span>}
                      {manager && <span>{trip.driverName} · </span>}
                      {trip.startKm !== null && trip.endKm !== null
                        ? t('kmRange', { start: km(trip.startKm), end: km(trip.endKm) })
                        : t('readingGone')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-ink">{distance === null ? '—' : `${km(distance)} km`}</span>
                    {mayRemove && <RemoveTripButton vehicleId={vehicle.id} tripId={trip.id} label={`${trip.fromPlace} → ${trip.toPlace}`} />}
                  </div>
                </li>
              </TripRow>
            )
          })}
        </ul>
      )}

      <a href={`/api/vehicles/${vehicle.id}/trips/export?month=${month.key}`} download className="btn-secondary">
        {t('download')}
      </a>
      <p className="mt-3 text-xs text-ink-faint">{manager ? t('footnote') : t('footnoteDriver')}</p>
    </div>
  )
}
