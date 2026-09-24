/**
 * RL-046, slice 4 of #49: Car Health — "is this car alright?" on one screen.
 *
 * Pure: it is handed what the app already knows and returns rows plus one
 * next action. Every message is a catalogue key with values, so the same
 * rows render in either language and the rules are testable without a
 * request.
 *
 * ## What it refuses to be
 *
 * - **Never a rating.** No score, no grade, no percentage. The app knows
 *   what it has been told, not the state of the car, and a number implies
 *   an inspection that never happened — it would end up in a sale listing.
 * - **Silence is not health.** An area with nothing recorded is `none`,
 *   never `ok`. A new vehicle is not all-green; it is all-unknown.
 * - **Context decides whether an area applies.** A restoration off the road
 *   is not "unhealthy" for having no valid ITP: its document rows are
 *   informational only, and it has no service row at all. Historic status
 *   (30+ years) changes nothing here — it is informational elsewhere too.
 *
 * ## One rule per fact
 *
 * Document days come from `getDocumentStatus()` — the function the
 * documents board and the reminder cron already use — so this screen, the
 * board and the emails cannot disagree about the same expiry date.
 * Distance comes from `distanceCovered()`, so a replaced gauge is handled
 * the same way as on the odometer page.
 */

import { getDocumentStatus } from './documents'
import { distanceCovered, type ReadingLike } from './odometer'
import { PROJECT_TYPE_CONFIG, type ProjectType } from './projectType'
import { powertrainOf, takesCharge, type Powertrain } from './powertrain'
import { sortReadings, warrantyStatus } from './batteryHealth'

export type HealthTone = 'ok' | 'warn' | 'danger' | 'info' | 'none'
export type HealthArea = 'document' | 'service' | 'tyres' | 'jobs' | 'battery' | 'warranty'

export interface Message {
  key: string
  values?: Record<string, string | number>
}

export interface HealthRow {
  area: HealthArea
  /** Stable, for React keys and for the next action to point at. */
  id: string
  /** A catalogue key for the row's name, or a document type code. */
  label: Message
  tone: HealthTone
  reason: Message
  /** Where fixing it starts. */
  href: string
  /** Lower is more urgent; only compared between rows of the same tone. */
  urgency: number
  action?: Message
}

export interface HealthReport {
  rows: HealthRow[]
  next: { message: Message; href: string } | null
}

/**
 * The default service interval — the common Romanian dealer schedule for
 * a petrol or diesel car. Stated on screen whenever it is used, because it
 * is an assumption about the car, not something the owner told us.
 */
export const SERVICE_INTERVAL_KM = 15_000
export const SERVICE_INTERVAL_DAYS = 365

/**
 * RL-056 (#124): the default per powertrain, typed as a full Record so
 * `tsc` names one left out. An electric car has no oil, filters or timing
 * belt and manufacturers schedule it very differently, so it has **no
 * default** (the owner's decision on #124): until the owner sets their own
 * interval the row is `none` and asks for it, never an assumed figure.
 */
export const DEFAULT_SERVICE_INTERVAL: Record<Powertrain, { km: number; days: number } | null> = {
  COMBUSTION: { km: SERVICE_INTERVAL_KM, days: SERVICE_INTERVAL_DAYS },
  HYBRID: { km: SERVICE_INTERVAL_KM, days: SERVICE_INTERVAL_DAYS },
  PLUGIN_HYBRID: { km: SERVICE_INTERVAL_KM, days: SERVICE_INTERVAL_DAYS },
  UNKNOWN: { km: SERVICE_INTERVAL_KM, days: SERVICE_INTERVAL_DAYS },
  ELECTRIC: null,
}

export { WARRANTY_WARN_DAYS, WARRANTY_WARN_KM } from './batteryHealth'

/**
 * #104: the owner's own interval, when they have given one. Either half
 * may be set alone — long-life oil by distance only, an off-road rig by
 * season only — and **the half they left empty is not filled in from the
 * default**: mixing the owner's figure with an assumption would state
 * something they never said. Only with neither set is the default used.
 */
export const SERVICE_INTERVAL_RANGES = {
  serviceIntervalKm: { min: 500, max: 100_000 },
  serviceIntervalMonths: { min: 1, max: 60 },
} as const
export type ServiceIntervalField = keyof typeof SERVICE_INTERVAL_RANGES

export interface ServiceInterval {
  km: number | null
  months: number | null
}

export type ServiceIntervalParse =
  | { ok: true; data: Partial<Record<ServiceIntervalField, number | null>> }
  | { ok: false; field: ServiceIntervalField }

/**
 * Reads the two interval fields out of a request body. Only fields sent are
 * returned; an empty string or null clears one.
 */
export function parseServiceInterval(body: Record<string, unknown>): ServiceIntervalParse {
  const data: Partial<Record<ServiceIntervalField, number | null>> = {}
  for (const field of Object.keys(SERVICE_INTERVAL_RANGES) as ServiceIntervalField[]) {
    const value = body[field]
    if (value === undefined) continue
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      data[field] = null
      continue
    }
    const n = Number(value)
    const range = SERVICE_INTERVAL_RANGES[field]
    if (!Number.isInteger(n) || n < range.min || n > range.max) return { ok: false, field }
    data[field] = n
  }
  return { ok: true, data }
}

/** The same day of the month, `months` later — the last day when that month is shorter. */
function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)))
}
const SERVICE_WARN_KM = 1_500
const SERVICE_WARN_DAYS = 30

/** Romanian legal minimum tread depth, and the point where wear is worth a look. */
export const TREAD_LEGAL_MIN_MM = 1.6
const TREAD_WARN_MM = 3
/** Common advice: have tyres checked from 6 years, replace by 10, whatever the tread. */
const TYRE_AGE_WARN_YEARS = 6
const TYRE_AGE_DANGER_YEARS = 10

export interface HealthInput {
  vehicleId: string
  projectType: ProjectType
  now: Date
  documents: { id: string; type: string; expiryDate: Date }[]
  tasks: { id: string; name: string; category: string; status: string; date: Date }[]
  readings: (ReadingLike & { readAt: Date })[]
  tyreSets: { id: string; isFitted: boolean; treadDepthMm: number | null; dotYear: number | null; fittedAt: Date | null; fittedKm: number | null }[]
  /** #104: the owner's interval; absent or both null means the default. */
  serviceInterval?: ServiceInterval
  /** The talon's fuel type; it picks the default interval and the battery rows. */
  fuelType?: string | null
  /** RL-056: only read for a vehicle that plugs in. */
  battery?: {
    readings: { date: Date; sohPercent: number; source: string; createdAt?: Date }[]
    warrantyUntil: Date | null
    warrantyKm: number | null
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeHealth(input: HealthInput): HealthReport {
  const base = `/dashboard/vehicles/${input.vehicleId}`
  const config = PROJECT_TYPE_CONFIG[input.projectType]
  const onTheRoad = input.projectType !== 'RESTORATION'
  const powertrain = powertrainOf(input.fuelType)
  const rows: HealthRow[] = []

  // ---- Documents: one row per type, from its latest expiry --------------
  const latestByType = new Map<string, Date>()
  for (const d of input.documents) {
    const current = latestByType.get(d.type)
    if (!current || d.expiryDate > current) latestByType.set(d.type, d.expiryDate)
  }
  if (latestByType.size === 0) {
    rows.push({
      area: 'document',
      id: 'documents',
      label: { key: 'area.documents' },
      tone: 'none',
      reason: { key: 'documents.none' },
      href: `${base}/documents`,
      urgency: 0,
      action: onTheRoad ? { key: 'nextAction.addDocuments' } : undefined,
    })
  }
  for (const [type, expiry] of Array.from(latestByType.entries())) {
    const { daysUntil, status } = getDocumentStatus(expiry, input.now)
    const reason: Message =
      status === 'expired'
        ? { key: 'documents.expired', values: { days: Math.abs(daysUntil) } }
        : daysUntil === 0
          ? { key: 'documents.today' }
          : { key: status === 'expiring' ? 'documents.expiring' : 'documents.valid', values: { days: daysUntil } }
    const tone: HealthTone = !onTheRoad
      ? 'info' // off the road: stated, never alarming
      : status === 'expired'
        ? 'danger'
        : status === 'expiring'
          ? 'warn'
          : 'ok'
    rows.push({
      area: 'document',
      id: `document:${type}`,
      label: { key: `doc.${type}` },
      tone,
      reason: onTheRoad
        ? reason
        : { key: status === 'expired' ? 'documents.offRoadExpired' : 'documents.offRoadValid', values: { days: Math.abs(daysUntil) } },
      href: `${base}/documents`,
      urgency: daysUntil,
      action: { key: 'nextAction.renew', values: { type } },
    })
  }

  // ---- Service: interval since the last completed service job ----------
  const ownInterval =
    input.serviceInterval && (input.serviceInterval.km !== null || input.serviceInterval.months !== null) ? input.serviceInterval : null
  const defaultInterval = DEFAULT_SERVICE_INTERVAL[powertrain]
  if (config.serviceCategory && !ownInterval && !defaultInterval) {
    // No interval of the owner's and none to assume: ask for theirs.
    rows.push({
      area: 'service',
      id: 'service',
      label: { key: 'area.service' },
      tone: 'none',
      reason: { key: 'service.noDefault' },
      href: `${base}/edit#service-interval`,
      urgency: 0,
      action: { key: 'nextAction.setServiceInterval' },
    })
  } else if (config.serviceCategory) {
    const services = input.tasks
      .filter((t) => t.category === config.serviceCategory && t.status === config.completeStatus && t.date <= input.now)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
    const last = services[0]
    if (!last) {
      rows.push({
        area: 'service',
        id: 'service',
        label: { key: 'area.service' },
        tone: 'none',
        reason: { key: 'service.none' },
        href: `${base}/tasks/new?category=${config.serviceCategory}`,
        urgency: 0,
        action: { key: 'nextAction.logService' },
      })
    } else {
      const own = ownInterval
      // Without the owner's interval there is a default: the branch above
      // took every powertrain that has none.
      const intervalKm = own ? own.km : defaultInterval!.km
      const lastDay = Date.UTC(last.date.getUTCFullYear(), last.date.getUTCMonth(), last.date.getUTCDate())
      const today = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate())
      const daysLeft = !own
        ? defaultInterval!.days - Math.floor((input.now.getTime() - last.date.getTime()) / DAY_MS)
        : own.months !== null
          ? Math.round((addMonthsUtc(new Date(lastDay), own.months).getTime() - today) / DAY_MS)
          : null
      // Distance since the service, across any gauge swap, from the
      // readings on or after its day (its own reading included).
      // Only measurable with a reading on the service day and one after
      // it; starting from a later reading would undercount the km and make
      // the warning late, which is the one direction this must not err in.
      const sinceDay = last.date.toISOString().slice(0, 10)
      const readingsSince = input.readings.filter((r) => r.readAt.toISOString().slice(0, 10) >= sinceDay)
      const hasDistance =
        readingsSince.some((r) => r.readAt.toISOString().slice(0, 10) === sinceDay) &&
        readingsSince.some((r) => r.readAt.toISOString().slice(0, 10) > sinceDay)
      const kmSince = hasDistance ? distanceCovered(readingsSince) : null
      const kmLeft = kmSince === null || intervalKm === null ? null : intervalKm - kmSince
      if (daysLeft === null && kmLeft === null) {
        // The owner's interval is by distance only, and the distance since
        // the service cannot be measured yet. Unknown, never fine.
        rows.push({
          area: 'service',
          id: 'service',
          label: { key: 'area.service' },
          tone: 'none',
          reason: { key: 'service.ownNoDistance', values: { intervalKm: intervalKm ?? 0 } },
          href: `${base}/odometer`,
          urgency: 0,
          action: { key: 'nextAction.recordKm' },
        })
      } else {
        const overdue = (daysLeft !== null && daysLeft <= 0) || (kmLeft !== null && kmLeft <= 0)
        const soon = (daysLeft !== null && daysLeft <= SERVICE_WARN_DAYS) || (kmLeft !== null && kmLeft <= SERVICE_WARN_KM)
        rows.push({
          area: 'service',
          id: 'service',
          label: { key: 'area.service' },
          tone: overdue ? 'danger' : soon ? 'warn' : 'ok',
          reason: own ? ownServiceReason(daysLeft, kmLeft, own) : defaultServiceReason(daysLeft!, kmLeft),
          href: `${base}/tasks/new?category=${config.serviceCategory}`,
          // Whichever runs out first sets the urgency; ~40 km a day to compare them.
          urgency: Math.min(daysLeft ?? Infinity, kmLeft === null ? Infinity : kmLeft / 40),
          action: { key: 'nextAction.bookService' },
        })
      }
    }
  }

  // ---- Tyres: the fitted set's tread and age --------------------------
  if (onTheRoad) {
    const fitted = input.tyreSets.find((s) => s.isFitted)
    if (input.tyreSets.length === 0 || !fitted) {
      rows.push({
        area: 'tyres',
        id: 'tyres',
        label: { key: 'area.tyres' },
        tone: 'none',
        reason: { key: input.tyreSets.length === 0 ? 'tyres.none' : 'tyres.noneFitted' },
        href: `${base}/tyres`,
        urgency: 0,
        action: { key: 'nextAction.addTyres' },
      })
    } else {
      const age = fitted.dotYear !== null ? input.now.getUTCFullYear() - fitted.dotYear : null
      const tread = fitted.treadDepthMm
      let tone: HealthTone = 'ok'
      let reason: Message
      let urgency = 0
      if (tread !== null && tread < TREAD_LEGAL_MIN_MM) {
        tone = 'danger'
        reason = { key: 'tyres.belowLegal', values: { mm: tread } }
        urgency = -1000
      } else if (age !== null && age >= TYRE_AGE_DANGER_YEARS) {
        tone = 'danger'
        reason = { key: 'tyres.tooOld', values: { years: age } }
        urgency = -500
      } else if (tread !== null && tread < TREAD_WARN_MM) {
        tone = 'warn'
        reason = { key: 'tyres.wearing', values: { mm: tread } }
        urgency = tread * 100
      } else if (age !== null && age >= TYRE_AGE_WARN_YEARS) {
        tone = 'warn'
        reason = { key: 'tyres.ageing', values: { years: age } }
        urgency = 1000
      } else if (tread === null && age === null) {
        tone = 'none'
        reason = { key: 'tyres.noMeasure' }
      } else {
        reason = tread !== null ? { key: 'tyres.okTread', values: { mm: tread } } : { key: 'tyres.okAge', values: { years: age ?? 0 } }
      }
      rows.push({
        area: 'tyres',
        id: 'tyres',
        label: { key: 'area.tyres' },
        tone,
        reason,
        href: `${base}/tyres`,
        urgency,
        action: tone === 'none' ? { key: 'nextAction.measureTread' } : { key: 'nextAction.tyres' },
      })
    }
  }

  // ---- High-voltage battery: recorded, never rated (RL-056) -------------
  if (onTheRoad && takesCharge(powertrain)) {
    const readings = sortReadings(input.battery?.readings ?? [])
    const latest = readings[readings.length - 1]
    const first = readings[0]
    rows.push({
      area: 'battery',
      id: 'battery',
      label: { key: 'area.battery' },
      // Information whatever the figure: there is no agreed line below
      // which a battery is worn, and this module never draws one.
      tone: latest ? 'info' : 'none',
      reason: !latest
        ? { key: 'battery.none' }
        : readings.length === 1
          ? { key: 'battery.recorded', values: { soh: latest.sohPercent, date: fmtDay(latest.date), source: latest.source } }
          : {
              key: 'battery.recordedSince',
              values: {
                soh: latest.sohPercent,
                date: fmtDay(latest.date),
                source: latest.source,
                firstSoh: first.sohPercent,
                firstDate: fmtDay(first.date),
              },
            },
      href: `${base}/battery`,
      urgency: 0,
      action: latest ? undefined : { key: 'nextAction.recordBattery' },
    })
    rows.push(warrantyRow(input, base))
  }

  // ---- Open jobs -----------------------------------------------------
  const toneOf = (status: string) => config.statusTags.find((s) => s.value === status)?.tone ?? 'neutral'
  const open = input.tasks.filter((t) => t.status !== config.completeStatus)
  const broken = open.filter((t) => toneOf(t.status) === 'danger')
  // "Due" work that has reached its date — a daily driver's to-do list.
  const dueNow = open.filter((t) => toneOf(t.status) === 'warn' && t.date <= input.now)
  if (input.tasks.length === 0) {
    rows.push({
      area: 'jobs',
      id: 'jobs',
      label: { key: 'area.jobs' },
      tone: 'none',
      reason: { key: 'jobs.none' },
      href: `${base}/tasks/new`,
      urgency: 0,
    })
  } else if (broken.length > 0) {
    rows.push({
      area: 'jobs',
      id: 'jobs',
      label: { key: 'area.jobs' },
      tone: 'danger',
      reason: { key: 'jobs.broken', values: { count: broken.length, name: broken[0].name } },
      href: `${base}/tasks/${broken[0].id}`,
      urgency: -100,
      action: { key: 'nextAction.fix', values: { name: broken[0].name } },
    })
  } else if (dueNow.length > 0) {
    const oldest = [...dueNow].sort((a, b) => a.date.getTime() - b.date.getTime())[0]
    rows.push({
      area: 'jobs',
      id: 'jobs',
      label: { key: 'area.jobs' },
      tone: 'warn',
      reason: { key: 'jobs.due', values: { count: dueNow.length, name: oldest.name } },
      href: `${base}/tasks/${oldest.id}`,
      urgency: -Math.floor((input.now.getTime() - oldest.date.getTime()) / DAY_MS),
      action: { key: 'nextAction.do', values: { name: oldest.name } },
    })
  } else {
    rows.push({
      area: 'jobs',
      id: 'jobs',
      label: { key: 'area.jobs' },
      // Planned build work is the point of a project, not a problem.
      tone: open.length > 0 ? 'info' : 'ok',
      reason: open.length > 0 ? { key: 'jobs.planned', values: { count: open.length } } : { key: 'jobs.clear' },
      href: base,
      urgency: 0,
    })
  }

  return { rows, next: nextAction(rows) }
}

const fmtDay = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

/**
 * The traction-battery warranty: whichever of the date and the km comes
 * first. The date half is `getDocumentStatus()`'s day count, so it agrees
 * with the documents board; the km half is the newest reading, and is
 * unknown after a replaced gauge (the reading is no longer the car's
 * total). Ended is `info` — there is nothing left to do about it.
 */
function warrantyRow(input: HealthInput, base: string): HealthRow {
  const until = input.battery?.warrantyUntil ?? null
  const limitKm = input.battery?.warrantyKm ?? null
  const row = { area: 'warranty' as const, id: 'warranty', label: { key: 'area.warranty' }, href: `${base}/battery` }
  const status = warrantyStatus(until, limitKm, input.readings, input.now)
  const { daysLeft, kmLeft } = status
  const date = until ? fmtDay(until) : ''

  if (status.state === 'none') {
    return { ...row, tone: 'none', reason: { key: 'warranty.none' }, urgency: 0, action: { key: 'nextAction.setWarranty' } }
  }
  if (status.state === 'ended') {
    return status.endedBy === 'date'
      ? { ...row, tone: 'info', reason: { key: 'warranty.endedDate', values: { date } }, urgency: 0 }
      : { ...row, tone: 'info', reason: { key: 'warranty.endedKm', values: { limitKm: limitKm! } }, urgency: 0 }
  }
  if (status.state === 'kmUnknown') {
    return {
      ...row,
      tone: 'none',
      reason: { key: 'warranty.kmUnknown', values: { limitKm: limitKm! } },
      urgency: 0,
      action: { key: 'nextAction.recordKm' },
      href: `${base}/odometer`,
    }
  }
  const reason: Message =
    daysLeft !== null && kmLeft !== null
      ? { key: 'warranty.both', values: { date, days: daysLeft, limitKm: limitKm!, km: kmLeft } }
      : daysLeft !== null && limitKm !== null
        ? { key: 'warranty.dateKmUnknown', values: { date, days: daysLeft, limitKm } }
        : daysLeft !== null
          ? { key: 'warranty.dateOnly', values: { date, days: daysLeft } }
          : { key: 'warranty.kmOnly', values: { limitKm: limitKm!, km: kmLeft! } }
  const soon = status.state === 'soon'
  return {
    ...row,
    tone: soon ? 'warn' : 'ok',
    reason,
    urgency: Math.min(daysLeft ?? Infinity, kmLeft === null ? Infinity : kmLeft / 40),
    action: soon ? { key: 'nextAction.batteryBeforeWarranty' } : undefined,
  }
}

/**
 * The service row's reason with the owner's own interval: it states their
 * figure, never "assuming". At least one of `daysLeft`/`kmLeft` is set.
 */
function ownServiceReason(daysLeft: number | null, kmLeft: number | null, own: ServiceInterval): Message {
  const intervalKm = own.km ?? 0
  const months = own.months ?? 0
  const kmOver = kmLeft !== null && kmLeft <= 0
  const timeOver = daysLeft !== null && daysLeft <= 0
  // Overdue names only what has run out: "overdue by 3 days or 2,000 km"
  // when the 2,000 km are still to go would read as twice as late.
  if (kmOver && timeOver) {
    return { key: 'service.ownOverdue', values: { km: -kmLeft!, days: -daysLeft!, intervalKm, months } }
  }
  if (kmOver) return { key: 'service.ownOverdueKm', values: { km: -kmLeft!, intervalKm } }
  if (timeOver) return { key: 'service.ownOverdueTime', values: { days: -daysLeft!, months } }
  if (daysLeft !== null && kmLeft !== null) {
    return { key: 'service.ownDue', values: { km: kmLeft, days: daysLeft, intervalKm, months } }
  }
  if (kmLeft !== null) return { key: 'service.ownDueKm', values: { km: kmLeft, intervalKm } }
  // By time. When the owner also gave a distance it cannot be measured
  // yet, and the message says how to fix that rather than dropping it.
  return own.km !== null
    ? { key: 'service.ownDueTimeKmUnknown', values: { days: daysLeft!, intervalKm, months } }
    : { key: 'service.ownDueTime', values: { days: daysLeft!, months } }
}

/** The same, with the default interval — every message says it is assumed. */
function defaultServiceReason(daysLeft: number, kmLeft: number | null): Message {
  const kmOver = kmLeft !== null && kmLeft <= 0
  const timeOver = daysLeft <= 0
  if (kmOver && timeOver) return { key: 'service.overdue', values: { km: -kmLeft!, days: -daysLeft } }
  if (kmOver) return { key: 'service.overdueKm', values: { km: -kmLeft! } }
  if (timeOver) return { key: 'service.overdueTime', values: { days: -daysLeft } }
  if (kmLeft === null) return { key: 'service.dueTime', values: { days: daysLeft } }
  return { key: 'service.due', values: { km: kmLeft, days: daysLeft } }
}

/**
 * One answer, not a list: the most urgent red, else the most urgent amber.
 * With nothing red or amber, the most useful thing to record next — the
 * app telling somebody what one number would buy them — and otherwise
 * nothing at all, rather than a reassurance it has no grounds for.
 */
export function nextAction(rows: HealthRow[]): HealthReport['next'] {
  for (const tone of ['danger', 'warn'] as const) {
    const candidates = rows.filter((r) => r.tone === tone && r.action).sort((a, b) => a.urgency - b.urgency)
    if (candidates[0]) return { message: candidates[0].action!, href: candidates[0].href }
  }
  const unknown = rows.find((r) => r.tone === 'none' && r.action)
  if (unknown) return { message: unknown.action!, href: unknown.href }
  return null
}
