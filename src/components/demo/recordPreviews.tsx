import { getLocale, getTranslations } from 'next-intl/server'
import { computeHealth, type HealthTone, type Message } from '@/lib/vehicleHealth'
import { consumptionIntervals, fuelSummary, type FuelLike } from '@/lib/fuel'
import { chargeConsumption, chargeSummary, type ChargeLocation, type ChargeMeasurable } from '@/lib/charging'
import { formatAmount, formatRon } from '@/lib/money'
import { labelFor } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'
import { CarSide, CarTop, ReceiptPicture } from './pictures'

/**
 * The tour's screens for the records a car on the road accumulates
 * (phase 5 of #49): identity, odometer, fuel, charging, the receipt scanner, Car
 * Health, tyres, cost of ownership, the service book, the passport and
 * accidents.
 *
 * Same rules as `previews.tsx`: invented rows in the app's own tokens,
 * framed by `DemoScreen` with its "sample data" caption, and the words
 * from the catalogue the real screens use — `health.*`, `fuel.*`,
 * `odometer.*`, `passport.*` — so renaming a label moves the tour too.
 * Where the app has a pure function for the thing being shown, the
 * preview runs it: Car Health is `computeHealth()` over sample records,
 * and the fuel figures are `fuelSummary()`, so the tour cannot show a
 * consumption the app would not compute.
 *
 * Everything is dated relative to today, so "expires in 12 days" stays
 * true whenever the page is read.
 */

const SAMPLE_MODE = 'DAILY_DRIVER' as const
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

/** Dates the way the reader's language writes them. */
async function dateFormat(): Promise<(d: Date) => string> {
  const locale = await getLocale()
  const f = new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return (d) => f.format(d)
}

const km = (value: number) => value.toLocaleString('ro-RO')

/**
 * The plate and the talon. The plate is fictional and deliberately not
 * one that can be issued (a county never gets `00`); a real vehicle's
 * plate never appears on a public page — `vehicleProfile.test.ts` holds
 * that for the real screens.
 */
export async function IdentityPreview() {
  const t = await getTranslations('demo')
  const tv = await getTranslations('vehicleProfile')
  const format = await dateFormat()
  const now = new Date()

  const fields: [string, string][] = [
    [tv('fuelType'), tv('fuel.DIESEL')],
    [tv('transmission'), tv('gearbox.MANUAL')],
    [tv('engineCapacityCc'), tv('summaryCc', { cc: km(1461) })],
    [tv('powerKw'), tv('summaryKw', { kw: 85, cp: 116 })],
    [tv('firstRegistrationDate'), format(new Date(Date.UTC(now.getUTCFullYear() - 6, 4, 14)))],
    [tv('colour'), t('sample.identity.colour')],
  ]

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="shrink-0 space-y-3">
        {/*
          A Romanian plate, drawn. The EU strip is a literal blue and the
          plate a literal white with black type, because a plate is those
          colours in either theme — the same exception ThemePreview makes.
        */}
        <div
          role="img"
          aria-label={t('sample.identity.plateAlt')}
          className="flex h-12 w-56 overflow-hidden rounded-md border-2 border-neutral-800 bg-white shadow-sm"
        >
          <div className="flex w-8 flex-col items-center justify-end pb-1" style={{ background: 'rgb(0 51 153)' }}>
            <span aria-hidden="true" className="mb-auto mt-1 text-[8px] leading-none" style={{ color: 'rgb(255 204 0)' }}>
              ★★★
            </span>
            <span className="text-[10px] font-bold text-white">RO</span>
          </div>
          <div className="flex flex-1 items-center justify-center font-mono text-2xl font-bold tracking-widest text-neutral-900">
            CJ 00 XYZ
          </div>
        </div>
        <CarSide className="h-20 w-56 text-ink-faint" label={t('sample.identity.carAlt')} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{t('sample.identity.vehicle')}</div>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2 border-b border-surface-border pb-1 text-sm">
              <dt className="text-ink-faint">{label}</dt>
              <dd className="text-right font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-muted">{t('sample.identity.note')}</p>
      </div>
    </div>
  )
}

/**
 * The odometer history: a gauge for the current reading, then where each
 * reading came from — the point of the feature is that most arrive on
 * their own, with a job, a fill-up or a handover.
 */
export async function OdometerPreview() {
  const t = await getTranslations('demo')
  const to = await getTranslations('odometer')
  const format = await dateFormat()
  const now = new Date()

  const rows = [
    { km: 27_412, days: 2, source: 'FUEL' as const },
    { km: 26_950, days: 19, source: 'TASK' as const },
    { km: 25_120, days: 64, source: 'MANUAL' as const },
    // The gauge was swapped, so the count restarted: kept as an exception
    // rather than refused for being lower than the reading before it.
    { km: 3_240, days: 410, source: 'MANUAL' as const, override: 'CLUSTER_REPLACED' as const },
  ]
  const digits = String(rows[0].km).padStart(6, '0').split('')

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col items-center">
        <svg viewBox="0 0 120 70" role="img" aria-label={t('sample.odometer.gaugeAlt')} className="h-24 w-40">
          <path d="M10 62 A50 50 0 0 1 110 62" fill="none" className="stroke-surface-border" strokeWidth={8} strokeLinecap="round" />
          <path d="M10 62 A50 50 0 0 1 84 18" fill="none" className="stroke-brand-500 dark:stroke-brand-400" strokeWidth={8} strokeLinecap="round" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const a = Math.PI - (i / 6) * Math.PI
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * 38}
                y1={62 - Math.sin(a) * 38}
                x2={60 + Math.cos(a) * 32}
                y2={62 - Math.sin(a) * 32}
                className="stroke-ink-faint"
                strokeWidth={1.5}
              />
            )
          })}
          <line x1="60" y1="62" x2="82" y2="30" className="stroke-ink" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx="60" cy="62" r="4" className="fill-ink" />
        </svg>
        <div className="-mt-1 flex gap-0.5 font-mono text-lg font-semibold tabular-nums">
          {digits.map((d, i) => (
            <span key={i} className="rounded bg-neutral-900 px-1.5 py-0.5 text-white">
              {d}
            </span>
          ))}
          <span className="ml-1 self-end text-xs text-ink-faint">km</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 divide-y divide-surface-border">
        {rows.map((row) => (
          <li key={row.km} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="text-sm font-medium tabular-nums text-ink">{to('km', { km: km(row.km) })}</div>
              <div className="text-xs text-ink-faint">
                {format(daysAgo(now, row.days))} · {to(`source.${row.source}`)}
              </div>
            </div>
            {row.override && (
              <span className="badge badge-warn" title={to(`override.${row.override}`)}>
                {to('overrideBadge')}: {to(`override.${row.override}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The fuel log. The figures are `fuelSummary()` over the sample fills,
 * including the partial one in the middle — so the tour shows the real
 * rule: a partial adds its litres but closes nothing.
 */
export async function FuelPreview() {
  const t = await getTranslations('demo')
  const tf = await getTranslations('fuel')
  const format = await dateFormat()
  const now = new Date()

  const entries: FuelLike[] = [
    { id: 'f1', date: daysAgo(now, 58), litres: 44.2, totalRon: 318.24, isFullTank: true, km: 84_010 },
    { id: 'f2', date: daysAgo(now, 41), litres: 41.8, totalRon: 301.0, isFullTank: true, km: 84_720 },
    { id: 'f3', date: daysAgo(now, 30), litres: 20.0, totalRon: 146.6, isFullTank: false, km: 85_050 },
    { id: 'f4', date: daysAgo(now, 19), litres: 25.9, totalRon: 188.8, isFullTank: true, km: 85_430 },
    { id: 'f5', date: daysAgo(now, 2), litres: 42.31, totalRon: 308.44, isFullTank: true, km: 86_070 },
  ]
  const summary = fuelSummary(entries)
  const intervals = consumptionIntervals(entries)
  const max = Math.max(...intervals.map((i) => i.litresPer100Km))
  const litres = (value: number) => value.toLocaleString('ro-RO', { maximumFractionDigits: 2 })

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface-muted p-3">
          <div className="text-xs text-ink-faint">{tf('average')}</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-ink">
            {summary.averageLitresPer100Km !== null ? tf('averageValue', { value: litres(summary.averageLitresPer100Km) }) : '—'}
          </div>
        </div>
        <div className="rounded-lg bg-surface-muted p-3">
          <div className="text-xs text-ink-faint">{tf('spent')}</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-ink">{formatRon(summary.totalRon)}</div>
          <div className="text-[11px] text-ink-faint">{tf('litresTotal', { litres: litres(summary.totalLitres), fills: summary.fills })}</div>
        </div>
      </div>

      {/* One bar per measured full-to-full interval; the value is written
          beside each, so the bar only makes the shape readable. */}
      <div className="mt-4 space-y-1.5" aria-label={t('sample.fuel.chartAlt')} role="img">
        {intervals.map((interval) => (
          <div key={interval.endId} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 tabular-nums text-ink-faint">{km(interval.km)} km</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
              <div className="h-full rounded-r-full bg-brand-500 dark:bg-brand-400" style={{ width: `${Math.round((interval.litresPer100Km / max) * 100)}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-ink-muted">{tf('averageValue', { value: litres(interval.litresPer100Km) })}</span>
          </div>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-surface-border border-t border-surface-border">
        {[...entries].reverse().slice(0, 3).map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-ink-muted">
              {format(entry.date)} · {litres(entry.litres)} l
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-ink">{formatRon(entry.totalRon)}</span>
              <span className={`badge ${entry.isFullTank ? 'badge-success' : 'badge-neutral'}`}>
                {entry.isFullTank ? tf('fullTank') : tf('partial')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">{t('sample.fuel.note')}</p>
    </div>
  )
}

/**
 * The charging log (RL-053/RL-054). The figures are `chargeSummary()` and
 * `chargeConsumption()` over the sample charges, and the samples are
 * chosen to show the rules rather than describe them: a free supermarket
 * charge (a record, 0 lei, energy but no cost), home charges priced from
 * the tariff, and a fast charge to 90% that closes nothing — consumption
 * is only measured from 80% back to 80%. The battery line is Car Health's
 * own row, from `computeHealth()`.
 */
export async function ChargingPreview() {
  const t = await getTranslations('demo')
  const tc = await getTranslations('charging')
  const th = await getTranslations('health')
  const tb = await getTranslations('battery')
  const format = await dateFormat()
  const now = new Date()

  type SampleCharge = ChargeMeasurable & { location: ChargeLocation; totalFromTariff: boolean }
  const charges: SampleCharge[] = [
    { id: 'c1', date: daysAgo(now, 40), km: 20_100, kwh: 32, totalRon: 38.4, socTo: 80, location: 'HOME', totalFromTariff: true },
    { id: 'c2', date: daysAgo(now, 31), km: 20_190, kwh: 11, totalRon: 0, socTo: null, location: 'PUBLIC_AC', totalFromTariff: false },
    { id: 'c3', date: daysAgo(now, 24), km: 20_420, kwh: 30, totalRon: 36, socTo: 80, location: 'HOME', totalFromTariff: true },
    { id: 'c4', date: daysAgo(now, 12), km: 20_700, kwh: 38, totalRon: 95, socTo: 90, location: 'PUBLIC_DC', totalFromTariff: false },
    { id: 'c5', date: daysAgo(now, 3), km: 20_860, kwh: 25, totalRon: 30, socTo: 80, location: 'HOME', totalFromTariff: true },
  ]
  const summary = chargeSummary(charges)
  const consumption = chargeConsumption(charges)
  const battery = computeHealth({
    vehicleId: 'sample',
    projectType: SAMPLE_MODE,
    now,
    fuelType: 'ELECTRIC',
    documents: [],
    tasks: [],
    readings: [],
    tyreSets: [],
    battery: {
      readings: [
        { date: daysAgo(now, 900), sohPercent: 98, source: 'WORKSHOP_TEST' },
        { date: daysAgo(now, 20), sohPercent: 93, source: 'WORKSHOP_TEST' },
      ],
      warrantyUntil: null,
      warrantyKm: null,
    },
  }).rows.find((row) => row.id === 'battery')
  const number = (value: number, digits = 2) => value.toLocaleString('ro-RO', { maximumFractionDigits: digits })
  const say = (m: Message) => {
    const values: Record<string, string | number> = { ...(m.values ?? {}) }
    if (typeof values.source === 'string') values.source = tb(`source.${values.source}`)
    return th(m.key, values)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface-muted p-3">
          <div className="text-xs text-ink-faint">{tc('consumption')}</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-ink">
            {consumption.averagePer100Km !== null ? tc('consumptionValue', { value: number(consumption.averagePer100Km) }) : '—'}
          </div>
          <div className="text-[11px] text-ink-faint">
            {tc('consumptionMeasured', { km: km(consumption.measuredKm), intervals: consumption.intervals })}
          </div>
        </div>
        <div className="rounded-lg bg-surface-muted p-3">
          <div className="text-xs text-ink-faint">{tc('spent')}</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-ink">{formatRon(summary.totalRon)}</div>
          <div className="text-[11px] text-ink-faint">{tc('kwhTotal', { kwh: number(summary.totalKwh), charges: summary.charges })}</div>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-surface-border border-t border-surface-border">
        {[...charges].reverse().slice(0, 4).map((charge) => (
          <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-ink-muted">
              {format(charge.date)} · {number(charge.kwh ?? 0)} kWh
              {charge.socTo !== null && ` · ${tc('socToOnly', { to: charge.socTo })}`}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-ink">{charge.totalRon === 0 ? tc('free') : formatRon(charge.totalRon)}</span>
              <span className="badge badge-neutral">{tc(`where.${charge.location}`)}</span>
              {charge.totalFromTariff && <span className="badge badge-info">{tc('fromTariff')}</span>}
            </span>
          </li>
        ))}
      </ul>
      {battery && (
        <p className="mt-2 rounded-lg bg-surface-muted p-2 text-xs text-ink-muted">
          <span className="font-medium text-ink">{th('area.battery')}: </span>
          {say(battery.reason)}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-muted">{t('sample.charging.note')}</p>
    </div>
  )
}

/**
 * The receipt scanner: a photographed receipt on the left, what the form
 * was filled with on the right. One field is flagged, because that is
 * what the scanner does with a value it read below its confidence bar —
 * and a tour that only ever showed a perfect read would promise one.
 */
export async function ReceiptScanPreview() {
  const t = await getTranslations('demo')
  const tf = await getTranslations('fuel')
  const now = new Date()
  const day = daysAgo(now, 2)
  const printed = `${String(day.getUTCDate()).padStart(2, '0')}.${String(day.getUTCMonth() + 1).padStart(2, '0')}.${day.getUTCFullYear()}`

  const fields: { label: string; value: string; unsure?: boolean }[] = [
    { label: tf('date'), value: printed },
    { label: tf('litres'), value: '42,31' },
    { label: tf('totalRon'), value: formatAmount(308.44) },
    { label: tf('station'), value: t('sample.scan.station'), unsure: true },
  ]

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <ReceiptPicture className="mx-auto h-64 w-44 shrink-0 sm:mx-0" date={printed} label={t('sample.scan.receiptAlt')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-brand-600 dark:text-brand-300" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
          </svg>
          {t('sample.scan.title')}
        </div>
        <dl className="mt-3 space-y-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs text-ink-faint">{field.label}</dt>
              <dd
                className={`mt-0.5 rounded-lg border px-3 py-1.5 text-sm tabular-nums ${
                  field.unsure ? 'note-warn border-transparent' : 'border-surface-border bg-surface text-ink'
                }`}
              >
                {field.value}
                {field.unsure && <span className="mt-0.5 block text-xs">{tf('scanUnsure')}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-muted">{tf('scanRead')}</p>
        <p className="mt-1 text-xs text-ink-faint">{t('sample.scan.privacy')}</p>
      </div>
    </div>
  )
}

const TONE_CLASS: Record<HealthTone, string> = {
  ok: 'badge-success',
  warn: 'badge-warn',
  danger: 'badge-danger',
  info: 'badge-info',
  none: 'badge-neutral',
}

/**
 * Car Health — `computeHealth()` itself, over sample records, rendered
 * the way `VehicleHealthPanel` renders it but without its links (they go
 * into a garage the reader does not have).
 */
export async function HealthPreview() {
  const t = await getTranslations('health')
  const td = await getTranslations('demo')
  const now = new Date()
  const serviceDay = daysAgo(now, 320)

  const report = computeHealth({
    vehicleId: 'sample',
    projectType: SAMPLE_MODE,
    now,
    documents: [
      { id: 'd1', type: 'ITP', expiryDate: daysAgo(now, -210) },
      { id: 'd2', type: 'RCA', expiryDate: daysAgo(now, -12) },
      { id: 'd3', type: 'ROVINIETA', expiryDate: daysAgo(now, -95) },
    ],
    tasks: [
      { id: 't1', name: td('sample.health.service'), category: 'SERVICING', status: 'DONE', date: serviceDay },
      { id: 't2', name: td('sample.health.brakes'), category: 'BRAKES', status: 'DUE', date: daysAgo(now, 5) },
    ],
    readings: [
      { id: 'r1', km: 72_400, readAt: serviceDay, isOverride: false },
      { id: 'r2', km: 86_070, readAt: daysAgo(now, 2), isOverride: false },
    ],
    tyreSets: [{ id: 's1', isFitted: true, treadDepthMm: 2.8, dotYear: now.getUTCFullYear() - 4, fittedAt: daysAgo(now, 300), fittedKm: 73_000 }],
  })

  const say = (m: Message) => {
    const values: Record<string, string | number> = { ...(m.values ?? {}) }
    if (typeof values.type === 'string') values.type = t(`doc.${values.type}`)
    for (const key of ['km', 'mm'] as const) {
      if (typeof values[key] === 'number') values[key] = (values[key] as number).toLocaleString('ro-RO')
    }
    return t(m.key, values)
  }

  return (
    <div>
      <p className="text-xs text-ink-faint">{t('subtitle')}</p>
      <ul className="mt-2 divide-y divide-surface-border">
        {report.rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
            <span className={`badge ${TONE_CLASS[row.tone]} shrink-0`}>{t(`tone.${row.tone}`)}</span>
            <div className="min-w-0 flex-1 basis-48">
              <div className="text-sm font-medium text-ink">{say(row.label)}</div>
              <p className="text-sm text-ink-muted">{say(row.reason)}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-surface-border pt-2 text-sm">
        <span className="font-semibold text-ink">{t('next')}: </span>
        <span className="text-brand-600 dark:text-brand-300">{report.next ? say(report.next.message) : t('nothingNext')}</span>
      </p>
    </div>
  )
}

/** Two tyre sets, one on the car, each with its tread and age. */
export async function TyresPreview() {
  const t = await getTranslations('demo')
  const tt = await getTranslations('tyres')
  const format = await dateFormat()
  const now = new Date()

  const sets = [
    { key: 'winter', season: 'WINTER' as const, size: '215/60 R17', year: now.getUTCFullYear() - 2, tread: 6.1, fitted: true, measured: 20 },
    { key: 'summer', season: 'SUMMER' as const, size: '215/60 R17', year: now.getUTCFullYear() - 4, tread: 3.4, fitted: false, measured: 190 },
  ]

  return (
    <ul className="space-y-2">
      {sets.map((set) => (
        <li key={set.key} className={`flex items-center gap-3 rounded-lg border border-surface-border p-3 ${set.fitted ? 'bg-surface' : 'bg-surface-muted'}`}>
          {/* A tyre, drawn: the sidewall and the tread blocks. */}
          <svg viewBox="0 0 40 40" aria-hidden="true" className="h-10 w-10 shrink-0 text-ink-muted">
            <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth={5} strokeDasharray="4 2" />
            <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth={2} />
            <circle cx="20" cy="20" r="2.5" fill="currentColor" />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{t(`sample.tyres.${set.key}`)}</span>
              <span className="badge badge-neutral">{tt(`season.${set.season}`)}</span>
              {set.fitted && <span className="badge badge-success">{tt('fittedBadge')}</span>}
            </div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {set.size} · {tt('madeIn', { year: set.year })} · {set.tread.toLocaleString('ro-RO')} mm, {tt('measuredOn', { date: format(daysAgo(now, set.measured)) })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The cost of ownership: the total, where it went, what a km costs —
 * and the gaps, listed, because a total that hides what it is missing
 * is the thing this page exists to avoid.
 */
export async function OwnershipPreview() {
  const t = await getTranslations('demo')
  const to = await getTranslations('ownership')
  const format = await dateFormat()

  const parts = [
    { key: 'purchase', amount: 52_000, tone: 'bg-brand-700 dark:bg-brand-300' },
    { key: 'energy', amount: 9_860, tone: 'bg-brand-500 dark:bg-brand-400' },
    { key: 'work', amount: 6_420, tone: 'bg-brand-400 dark:bg-brand-500' },
    { key: 'insurance', amount: 3_150, tone: 'bg-brand-300 dark:bg-brand-600' },
    { key: 'tyres', amount: 2_300, tone: 'bg-brand-200 dark:bg-brand-700' },
    { key: 'roadCharges', amount: 890, tone: 'bg-brand-100 dark:bg-brand-800' },
  ]
  const total = parts.reduce((sum, p) => sum + p.amount, 0)
  const running = total - parts[0].amount
  const perKm = running / 38_400

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-ink-faint">{to('total')}</div>
          <div className="text-2xl font-bold tabular-nums text-ink">{formatRon(total, 0)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-faint">{to('perKmTitle')}</div>
          <div className="text-base font-semibold tabular-nums text-ink">
            {to('perKmValue', { value: perKm.toLocaleString('ro-RO', { maximumFractionDigits: 2 }) })}
          </div>
        </div>
      </div>

      {/* One stacked bar — the parts of one whole — with every figure
          written in the legend, so no colour has to be decoded. */}
      <div className="mt-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={t('sample.ownership.chartAlt')}>
        {parts.map((p) => (
          <div key={p.key} className={p.tone} style={{ width: `${(p.amount / total) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-2 text-sm">
            <dt className="flex items-center gap-2 text-ink-muted">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${p.tone}`} />
              {to(`category.${p.key}`)}
            </dt>
            <dd className="tabular-nums text-ink">{formatRon(p.amount, 0)}</dd>
          </div>
        ))}
      </dl>
      <div className="note-warn mt-3 rounded-lg p-3 text-xs">
        <div className="font-semibold">{to('coverageTitle')}</div>
        <p className="mt-0.5">{to('coverage.documentsWithoutPrice', { count: 1 })}</p>
        <p className="mt-0.5">{to('coverage.fuelSince', { date: format(daysAgo(new Date(), 420)) })}</p>
      </div>
    </div>
  )
}

/**
 * The service book: completed jobs by date and km, one entered late and
 * one after a replaced odometer, each flagged on its row rather than
 * smoothed over.
 */
export async function ServiceBookPreview() {
  const t = await getTranslations('demo')
  const ts = await getTranslations('serviceBook')
  const config = await getVocabulary(SAMPLE_MODE)
  const format = await dateFormat()
  const now = new Date()

  const rows = [
    { key: 'brakes', days: 19, km: 86_950, category: 'BRAKES', cost: 780, workshop: true },
    { key: 'service', days: 320, km: 72_400, category: 'SERVICING', cost: 1_240, workshop: true, flag: 'loggedLate' as const, logged: 250 },
    { key: 'clutch', days: 520, km: 61_200, category: 'TRANSMISSION', cost: 2_900, workshop: true, flag: 'odometerReset' as const },
    { key: 'wipers', days: 700, km: 55_800, category: 'BODYWORK', cost: 95, workshop: false },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{ts('title')}</span>
        <span className="badge badge-neutral">{ts('ownerView')}</span>
      </div>
      <ol className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="rounded-lg border border-surface-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{t(`sample.serviceBook.${row.key}`)}</span>
              <span className="text-sm tabular-nums text-ink">{formatRon(row.cost, 0)}</span>
            </div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {format(daysAgo(now, row.days))} · {km(row.km)} km · {labelFor(config.categories, row.category)} ·{' '}
              {row.workshop ? ts('workshop') : ts('diy')}
            </div>
            {row.flag && (
              <p className="note-warn mt-2 rounded px-2 py-1 text-xs">
                {row.flag === 'loggedLate' ? ts('flag.loggedLate', { date: format(daysAgo(now, row.logged ?? 0)) }) : ts(`flag.${row.flag}`)}
              </p>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-faint">{ts('provenance')}</p>
    </div>
  )
}

/**
 * The passport, as the document it is: what it is in its heading, every
 * section tagged as the owner's view, a gap listed, and the absence of
 * accident records worded as exactly that.
 */
export async function PassportPreview() {
  const t = await getTranslations('demo')
  const tp = await getTranslations('passport')
  const format = await dateFormat()
  const now = new Date()

  const tiles = [
    { label: t('sample.passport.ownedSince'), value: String(now.getUTCFullYear() - 5) },
    { label: t('sample.passport.latestKm'), value: `${km(86_070)} km` },
    { label: t('sample.passport.jobs'), value: '27' },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
      <div className="rounded-lg border-2 border-surface-border bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">RigLog</div>
            <div className="text-base font-semibold text-ink">{tp('title')}</div>
            <div className="text-xs text-ink-faint">{t('sample.identity.vehicle')}</div>
          </div>
          {/* A drawn seal-like mark would suggest an authority; this is a
              plain document icon instead, on purpose. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 shrink-0 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M6 3h9l3 3v15H6z" />
            <path d="M9 10h6M9 13h6M9 16h4" />
          </svg>
        </div>
        <p className="note-warn mt-2 rounded px-2 py-1.5 text-xs">{tp('what')}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg bg-surface-muted p-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">{tile.label}</div>
              <div className="text-sm font-semibold tabular-nums text-ink">{tile.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <p className="flex flex-wrap items-center gap-2 text-ink-muted">
            <span className="badge badge-neutral">{tp('ownerView')}</span>
            {t('sample.passport.gap', { from: format(daysAgo(now, 1300)), to: format(daysAgo(now, 880)) })}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-ink-muted">
            <span className="badge badge-neutral">{tp('ownerView')}</span>
            {tp('absence.noAccidentsRecorded')}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="rounded-lg border border-surface-border p-3">
          <div className="text-xs text-ink-faint">{t('sample.passport.link')}</div>
          <div className="mt-1 truncate font-mono text-xs text-ink">/passport/k3Vq…9xT</div>
          <span className="btn-secondary pointer-events-none mt-2 text-xs">{t('sample.passport.withdraw')}</span>
        </div>
        <ul className="space-y-1 text-xs text-ink-muted">
          {(['plate', 'vin', 'costs'] as const).map((key) => (
            <li key={key} className="flex items-center justify-between gap-2">
              <span>{t(`sample.passport.show.${key}`)}</span>
              <span className={`badge ${key === 'costs' ? 'badge-success' : 'badge-neutral'}`}>
                {t(key === 'costs' ? 'sample.passport.on' : 'sample.passport.off')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** One damage record, with where on the car it was — drawn from above. */
export async function AccidentsPreview() {
  const t = await getTranslations('demo')
  const ta = await getTranslations('accidents')
  const format = await dateFormat()
  const now = new Date()

  const fields: [string, string][] = [
    [ta('kindLabel'), ta('kind.PARKING')],
    [ta('date'), format(daysAgo(now, 140))],
    [ta('km'), `${km(81_300)} km`],
    [ta('insuranceLabel'), ta('insurance.CASCO')],
    [ta('repairedAt'), format(daysAgo(now, 126))],
  ]

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <CarTop className="mx-auto h-44 w-24 shrink-0 text-ink-faint sm:mx-0" label={t('sample.accident.carAlt')} damage />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{t('sample.accident.title')}</div>
        <p className="mt-0.5 text-sm text-ink-muted">{t('sample.accident.description')}</p>
        <dl className="mt-3 space-y-1.5">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2 border-b border-surface-border pb-1 text-sm">
              <dt className="text-ink-faint">{label}</dt>
              <dd className="text-right font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-faint">{ta('photosPrivate')}</p>
      </div>
    </div>
  )
}
