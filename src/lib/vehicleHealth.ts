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

export type HealthTone = 'ok' | 'warn' | 'danger' | 'info' | 'none'
export type HealthArea = 'document' | 'service' | 'tyres' | 'jobs'

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
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeHealth(input: HealthInput): HealthReport {
  const base = `/dashboard/vehicles/${input.vehicleId}`
  const config = PROJECT_TYPE_CONFIG[input.projectType]
  const onTheRoad = input.projectType !== 'RESTORATION'
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
  if (config.serviceCategory) {
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
      const daysSince = Math.floor((input.now.getTime() - last.date.getTime()) / DAY_MS)
      const daysLeft = SERVICE_INTERVAL_DAYS - daysSince
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
      const kmLeft = kmSince === null ? null : SERVICE_INTERVAL_KM - kmSince
      const overdue = daysLeft <= 0 || (kmLeft !== null && kmLeft <= 0)
      const soon = daysLeft <= SERVICE_WARN_DAYS || (kmLeft !== null && kmLeft <= SERVICE_WARN_KM)
      rows.push({
        area: 'service',
        id: 'service',
        label: { key: 'area.service' },
        tone: overdue ? 'danger' : soon ? 'warn' : 'ok',
        reason:
          kmLeft === null
            ? { key: overdue ? 'service.overdueTime' : 'service.dueTime', values: { days: Math.abs(daysLeft) } }
            : {
                key: overdue ? 'service.overdue' : 'service.due',
                values: { km: Math.abs(kmLeft), days: Math.abs(daysLeft) },
              },
        href: `${base}/tasks/new?category=${config.serviceCategory}`,
        // Whichever runs out first sets the urgency; ~40 km a day to compare them.
        urgency: Math.min(daysLeft, kmLeft === null ? Infinity : kmLeft / 40),
        action: { key: 'nextAction.bookService' },
      })
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
        action: { key: tone === 'none' ? 'next.measureTread' : 'next.tyres' },
      })
    }
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
