import { getLocale, getTranslations } from 'next-intl/server'
import { complianceBoard, FLEET_DOCUMENT_TYPES, type FleetCell } from '@/lib/fleet'
import { currentMonth, reconcileMonth, shiftMonth, tripDistance, type TripLike } from '@/lib/trips'
import { formatRon } from '@/lib/money'
import { LADDER } from '@/lib/plans'
import { CarSide, CarTop, FilePicture } from './pictures'

/**
 * The tour's screens for organisations and their fleets (RL-038–042,
 * RL-051), sold on a company plan.
 *
 * Same rules as the other previews: invented rows, the real screens'
 * catalogue strings (`fleet.*`, `drivers.*`, `trips.*`, `fleetReport.*`,
 * `organizations.role.*`), and the real function wherever there is one.
 * The compliance grid is `complianceBoard()` — sorted and counted by it,
 * worst first — and the trip reconciliation is `reconcileMonth()` over
 * sample trips and readings, so the gaps it lists are the ones the app
 * would list. The company, its people and its plates are invented; the
 * plates use `00`, which is never issued.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const km = (value: number) => value.toLocaleString('ro-RO')

async function dateFormat(options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const locale = await getLocale()
  const f = new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', options)
  return (d: Date) => f.format(d)
}

/** The organisation: who is in it, in which role, and on which plan. */
export async function OrganizationPreview() {
  const t = await getTranslations('demo')
  const to = await getTranslations('organizations')
  const tb = await getTranslations('orgBilling')

  const people = [
    { key: 'a', role: 'OWNER' },
    { key: 'b', role: 'FLEET_MANAGER' },
    { key: 'c', role: 'MECHANIC' },
    { key: 'd', role: 'DRIVER' },
    { key: 'e', role: 'DRIVER' },
  ] as const
  const roleBadge: Record<string, string> = {
    OWNER: 'badge-brand',
    FLEET_MANAGER: 'badge-info',
    MECHANIC: 'badge-success',
    DRIVER: 'badge-neutral',
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-ink">{t('sample.org.name')}</div>
          <div className="text-xs text-ink-faint">
            {to('cuiLine', { cui: 'RO00000000' })} · {to('memberCount', { count: people.length })}
          </div>
        </div>
        <div className="rounded-lg bg-surface-muted px-3 py-2 text-right text-xs">
          <div className="font-medium text-ink">{tb('onPlan', { plan: tb('tier.BUSINESS'), period: tb('period.month') })}</div>
          <div className="text-ink-muted">{tb('vehiclesOf', { count: 18, limit: LADDER.BUSINESS.vehicles })}</div>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-surface-border">
        {people.map((person) => (
          <li key={person.key} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-xs font-semibold text-ink-muted"
              >
                {t(`sample.org.person.${person.key}`).slice(0, 1)}
              </span>
              <span className="truncate text-sm text-ink">{t(`sample.org.person.${person.key}`)}</span>
            </div>
            <span className={`badge ${roleBadge[person.role]}`}>{to(`role.${person.role}`)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">{t('sample.org.note')}</p>
    </div>
  )
}

function cellClass(cell: FleetCell): string {
  if (!cell) return 'bg-surface-subtle text-ink-faint'
  if (cell.status === 'expired') return 'badge-danger'
  if (cell.status === 'expiring') return 'badge-warn'
  return 'badge-success'
}

/**
 * Fleet compliance: every vehicle against every document a roadside
 * check asks for. `complianceBoard()` sorts it — the van that is off the
 * road today first — and counts the tiles.
 */
export async function FleetBoardPreview() {
  const tf = await getTranslations('fleet')
  const th = await getTranslations('health')
  const now = new Date()
  const inDays = (d: number) => new Date(now.getTime() + d * DAY_MS)

  const vehicles = [
    { id: 'v1', year: 2019, make: 'Dacia', model: 'Logan MCV', plate: 'CJ 00 ABC' },
    { id: 'v2', year: 2021, make: 'Ford', model: 'Transit Custom', plate: 'CJ 00 DEF' },
    { id: 'v3', year: 2017, make: 'Renault', model: 'Master', plate: 'CJ 00 GHI' },
    { id: 'v4', year: 2023, make: 'Dacia', model: 'Duster', plate: 'CJ 00 JKL' },
  ]
  const plan: Record<string, Partial<Record<(typeof FLEET_DOCUMENT_TYPES)[number], number>>> = {
    v1: { ITP: 140, RCA: 12, CASCO: 200, ROVINIETA: 60, FIRST_AID_KIT: 400, FIRE_EXTINGUISHER: 25 },
    v2: { ITP: 330, RCA: 180, ROVINIETA: 90, FIRST_AID_KIT: 610, FIRE_EXTINGUISHER: 300 },
    v3: { ITP: -4, RCA: 45, CASCO: 45, ROVINIETA: 8, FIRST_AID_KIT: 120, FIRE_EXTINGUISHER: 200 },
    v4: { ITP: 700, RCA: 260, CASCO: 260, ROVINIETA: 300 },
  }
  const documents = Object.entries(plan).flatMap(([vehicleId, types]) =>
    Object.entries(types).map(([type, days]) => ({ vehicleId, type, expiryDate: inDays(days as number) }))
  )
  const board = complianceBoard(vehicles, documents, now)

  const tiles = [
    { key: 'offRoad', value: board.totals.offRoad, tone: board.totals.offRoad > 0 ? 'note-danger' : 'bg-surface-muted' },
    { key: 'expiring', value: board.totals.expiring, tone: board.totals.expiring > 0 ? 'note-warn' : 'bg-surface-muted' },
    { key: 'vehicles', value: board.totals.vehicles, tone: 'bg-surface-muted' },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.key} className={`rounded-lg p-2.5 ${tile.tone}`}>
            <div className="text-[11px] leading-tight opacity-80">{tf(tile.key)}</div>
            <div className="text-lg font-bold tabular-nums">{tile.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-xs">
          <caption className="sr-only">{tf('caption')}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium text-ink-faint">
                {tf('vehicle')}
              </th>
              {FLEET_DOCUMENT_TYPES.map((type) => (
                <th key={type} scope="col" className="text-center font-medium text-ink-faint">
                  {th(`doc.${type}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.vehicle.id}>
                <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal">
                  <span className="block font-medium text-ink">
                    {row.vehicle.make} {row.vehicle.model}
                  </span>
                  <span className="font-mono text-[10px] text-ink-faint">{row.vehicle.plate}</span>
                  {row.expired.length > 0 && <span className="badge badge-danger ml-1 align-middle text-[10px]">{tf('offRoadBadge')}</span>}
                </th>
                {FLEET_DOCUMENT_TYPES.map((type) => {
                  const cell = row.cells[type]
                  return (
                    <td key={type} className={`rounded px-1 py-1.5 text-center tabular-nums ${cellClass(cell)}`}>
                      {cell ? tf('days', { days: cell.daysUntil }) : tf('none')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Fleet cost: the tiles, the monthly trend, and each vehicle's line. */
export async function FleetCostsPreview() {
  const t = await getTranslations('demo')
  const tc = await getTranslations('fleet.cost')
  const month = await dateFormat({ month: 'short' })
  const now = new Date()

  const trend = [8_900, 11_200, 9_700, 14_600, 10_300, 12_100]
  const max = Math.max(...trend)
  const months = trend.map((_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (trend.length - 1 - i), 1)))
  // The four vehicles' lines add up to the six months' running cost, as
  // they do on the real page — a preview whose figures don't reconcile
  // would teach the reader the page doesn't either.
  const running = trend.reduce((s, n) => s + n, 0)

  const vehicles = [
    { name: 'Ford Transit Custom', amount: 24_300, gaps: 0 },
    { name: 'Renault Master', amount: 21_950, gaps: 2 },
    { name: 'Dacia Logan MCV', amount: 13_480, gaps: 0 },
    { name: 'Dacia Duster', amount: 7_070, gaps: 0 },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'running', value: formatRon(running, 0) },
          { key: 'perVehicleMonth', value: formatRon(Math.round(running / (vehicles.length * trend.length)), 0) },
          { key: 'withGaps', value: '1' },
        ].map((tile) => (
          <div key={tile.key} className="rounded-lg bg-surface-muted p-2.5">
            <div className="text-[11px] leading-tight text-ink-faint">{tc(tile.key)}</div>
            <div className="text-sm font-semibold tabular-nums text-ink">{tile.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs font-medium text-ink-muted">{tc('trend')}</div>
      {/* Single series, one hue; every month's figure is in the title so
          a hover or a screen reader gets the number, not just the height. */}
      <div className="mt-2 flex h-28 items-end gap-2" role="img" aria-label={t('sample.fleetCost.chartAlt')}>
        {trend.map((value, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t bg-brand-500 dark:bg-brand-400"
              style={{ height: `${Math.round((value / max) * 100)}%` }}
              title={formatRon(value, 0)}
            />
            <span className="text-[10px] text-ink-faint">{month(months[i])}</span>
          </div>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-surface-border border-t border-surface-border">
        {vehicles.map((v) => (
          <li key={v.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-ink">{v.name}</span>
            <span className="flex items-center gap-2">
              {v.gaps > 0 && <span className="badge badge-warn">{tc('gaps', { count: v.gaps })}</span>}
              <span className="tabular-nums text-ink">{formatRon(v.amount, 0)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Drivers: who has the van now, who had it before with the km at each
 * end, the handover photos, and what the driver's own screen offers.
 */
export async function DriversPreview() {
  const t = await getTranslations('demo')
  const td = await getTranslations('drivers')
  const tp = await getTranslations('driverPanel')
  const format = await dateFormat()
  const now = new Date()
  const ago = (d: number) => new Date(now.getTime() - d * DAY_MS)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{td('current')}</div>
        <div className="mt-1 text-sm font-medium text-ink">{t('sample.org.person.d')}</div>
        <div className="text-xs text-ink-faint">
          {td('since', { date: format(ago(9)) })} · {km(40_020)} km
        </div>

        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{td('history')}</div>
        <ul className="mt-1 space-y-1 text-xs text-ink-muted">
          <li>
            {t('sample.org.person.e')} · {format(ago(64))} – {format(ago(9))} · {td('kmRange', { start: km(36_410), end: km(40_020) })}
          </li>
          <li>
            {t('sample.org.person.d')} · {format(ago(150))} – {format(ago(64))} · {td('kmRange', { start: km(31_900), end: km(36_410) })}
          </li>
        </ul>

        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{td('photoStart')}</div>
        <div className="mt-1 grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-12 items-center justify-center rounded-md border border-surface-border bg-surface-subtle">
              {i < 2 ? (
                <CarSide className={`h-7 w-12 text-ink-faint ${i === 1 ? '-scale-x-100' : ''}`} />
              ) : (
                <CarTop className={`h-10 w-6 text-ink-faint ${i === 3 ? 'rotate-180' : ''}`} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">{t('sample.drivers.photosNote')}</p>
      </div>

      {/* The driver's own view of the vehicle. */}
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-400/30 dark:bg-brand-400/10">
        <div className="text-sm font-semibold text-ink">{tp('title')}</div>
        <div className="text-xs text-ink-muted">{tp('since', { date: format(ago(9)) })}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['report', 'fuel', 'expense', 'km', 'trips', 'documents'] as const).map((key) => (
            <span key={key} className={`pointer-events-none text-xs ${key === 'report' ? 'btn-primary' : 'btn-secondary'}`}>
              {tp(key)}
            </span>
          ))}
        </div>
        <div className="mt-3 border-t border-brand-200 pt-2 text-xs text-ink-muted dark:border-brand-400/30">
          <span className="font-semibold text-ink">{tp('endTitle')}.</span> {tp('endHelp')}
        </div>
      </div>
    </div>
  )
}

/**
 * The month's trips against the odometer — `reconcileMonth()` over
 * sample trips, in last month so every day of it is in the past.
 */
export async function TripsPreview() {
  const t = await getTranslations('demo')
  const tt = await getTranslations('trips')
  const format = await dateFormat({ day: 'numeric', month: 'short' })
  const month = shiftMonth(currentMonth(new Date()), -1)
  const on = (day: number) => new Date(month.from.getTime() + (day - 1) * DAY_MS + 9 * 60 * 60 * 1000)

  const trips: (TripLike & { from: string; to: string })[] = [
    { id: 't1', date: on(3), kind: 'BUSINESS', createdAt: on(3), startKm: 40_020, endKm: 40_052, from: 'Cluj-Napoca', to: 'Turda' },
    { id: 't2', date: on(3), kind: 'BUSINESS', createdAt: on(3), startKm: 40_052, endKm: 40_085, from: 'Turda', to: 'Cluj-Napoca' },
    { id: 't3', date: on(7), kind: 'PERSONAL', createdAt: on(7), startKm: 40_085, endKm: 40_101, from: 'Cluj-Napoca', to: 'Florești' },
    { id: 't4', date: on(12), kind: 'BUSINESS', createdAt: on(12), startKm: 40_140, endKm: 40_239, from: 'Cluj-Napoca', to: 'Alba Iulia' },
  ]
  const readings = [
    { id: 'r0', km: 40_000, readAt: new Date(month.from.getTime() - 2 * DAY_MS), isOverride: false },
    ...trips.flatMap((trip) => [
      { id: `${trip.id}s`, km: trip.startKm as number, readAt: trip.date, isOverride: false },
      { id: `${trip.id}e`, km: trip.endKm as number, readAt: trip.date, isOverride: false },
    ]),
    { id: 'r9', km: 40_260, readAt: on(20), isOverride: false },
  ]
  const r = reconcileMonth(trips, readings, month)
  const label = (id: string | null) => {
    const trip = trips.find((x) => x.id === id)
    return trip ? `${trip.from} → ${trip.to}, ${format(trip.date)}` : ''
  }
  const where = (gap: (typeof r.gaps)[number]) =>
    gap.afterTripId && gap.beforeTripId
      ? tt('gapBetween', { after: label(gap.afterTripId), before: label(gap.beforeTripId) })
      : gap.beforeTripId
        ? tt('gapBefore', { before: label(gap.beforeTripId) })
        : tt('gapAfter', { after: label(gap.afterTripId) })

  const total = r.odometer?.km ?? 1
  const unlogged = Math.max(0, r.unlogged ?? 0)
  const split = [
    { key: 'BUSINESS', value: r.business, tone: 'bg-brand-600 dark:bg-brand-300' },
    { key: 'PERSONAL', value: r.personal, tone: 'bg-brand-300 dark:bg-brand-600' },
    { key: 'unlogged', value: unlogged, tone: 'bg-amber-400 dark:bg-amber-500' },
  ]

  return (
    <div>
      <ul className="divide-y divide-surface-border">
        {trips.map((trip) => (
          <li key={trip.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">
                {trip.from} → {trip.to}
              </div>
              <div className="text-xs text-ink-faint">
                {format(trip.date)} · {t('sample.org.person.d')} · {tt('kmRange', { start: km(trip.startKm ?? 0), end: km(trip.endKm ?? 0) })}
              </div>
            </div>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-ink">{tt('distance', { km: km(tripDistance(trip) ?? 0) })}</span>
              <span className={`badge ${trip.kind === 'BUSINESS' ? 'badge-brand' : 'badge-neutral'}`}>{tt(`kind.${trip.kind}`)}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{tt('reconcileTitle')}</div>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full" role="img" aria-label={t('sample.trips.chartAlt')}>
        {split.map((s) => (
          <div key={s.key} className={s.tone} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {split.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${s.tone}`} />
            <dt className="text-ink-muted">{s.key === 'unlogged' ? tt('unloggedTile') : tt(`kind.${s.key}`)}</dt>
            <dd className="font-medium tabular-nums text-ink">{km(s.value)} km</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-2 space-y-1 text-xs text-ink-muted">
        {r.gaps.map((gap, i) => (
          <li key={i}>{gap.km === null ? tt('gapUnknown', { where: where(gap) }) : tt('gapKm', { km: km(gap.km), where: where(gap) })}</li>
        ))}
      </ul>
      <p className="note-warn mt-3 rounded-lg p-2.5 text-xs">{tt('notOfficial')}</p>
    </div>
  )
}

/** The three files the accountant asks for, and what a CSV row looks like. */
export async function FleetReportsPreview() {
  const t = await getTranslations('demo')
  const tr = await getTranslations('fleetReport')

  const files = [
    { key: 'summary', kind: 'PDF' as const },
    { key: 'jobs', kind: 'CSV' as const },
    { key: 'costs', kind: 'CSV' as const },
  ]
  const header = [tr('csv.date'), tr('csv.vehicle'), tr('csv.costCategory'), tr('csv.driver'), tr('csv.amount')]
  const rows = [
    ['03.08', 'Ford Transit Custom', t('sample.reports.fuel'), 'Mihai Stan', '308,44'],
    ['05.08', 'Renault Master', t('sample.reports.service'), '', '1.240,00'],
  ]

  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {files.map((file) => (
          <li key={file.key} className="flex gap-2 rounded-lg border border-surface-border p-3">
            <FilePicture kind={file.kind} className="h-12 w-10 shrink-0 text-brand-600 dark:text-brand-300" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{tr(`files.${file.key}`)}</div>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{tr(`files.${file.key}Help`)}</p>
            </div>
          </li>
        ))}
      </ul>
      {/* The raw file, as Excel receives it: quoted, `;` between columns,
          the Romanian decimal comma. */}
      <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
        {[header, ...rows].map((cells) => cells.map((c) => `"${c}"`).join(';')).join('\n')}
      </pre>
      <p className="mt-2 text-xs text-ink-faint">{t('sample.reports.note')}</p>
    </div>
  )
}
