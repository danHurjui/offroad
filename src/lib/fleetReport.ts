import { costLines, type CostCategory, type CostLine, type OwnershipInput } from './ownershipCosts'
import { COST_CATEGORIES } from './costKinds'
import { taskTotalCost } from './analytics'
import { FLEET_DOCUMENT_TYPES, type FleetDocumentType } from './fleet'

/**
 * RL-041: what a fleet's accountant is sent — the jobs, every cost with who
 * was driving, and a one-period summary. Pure; the routes under
 * `/api/organizations/[orgId]/reports/` load the rows, check the caller
 * and write the files.
 *
 * - **The period is checked here, on the server,** whatever the form
 *   offered: whole days, `from` ≤ `to`, at most `REPORT_MAX_DAYS`. This is
 *   the most expensive read in the app after the GDPR export, run against
 *   a whole fleet, so the ceiling is deliberate — a year, which is the
 *   longest period an accountant closes.
 * - **Everything comes from the functions the screens use**: cost lines
 *   from `costLines()` (the vehicle's costs page), job totals from
 *   `taskTotalCost()`. An export that adds up differently from the page it
 *   was downloaded from is worse than none.
 * - **Nothing is filled in.** A cost with no driver assigned that day has
 *   an empty driver; an expiry with no renewal on record says so.
 */

export const REPORT_MAX_DAYS = 366

const DAY_MS = 86_400_000

export interface ReportPeriod {
  /** 00:00 UTC on the first day. */
  from: Date
  /** 00:00 UTC on the last day (inclusive). */
  to: Date
  /** 00:00 UTC on the day after the last — the exclusive bound queries use. */
  end: Date
}

export type PeriodResult = { ok: true; period: ReportPeriod } | { ok: false; code: 'reportPeriodInvalid' | 'reportPeriodTooLong' }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const m = DAY.exec(value)
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // Rejects 2026-02-30, which Date.UTC would roll into March.
  return date.toISOString().slice(0, 10) === value ? date : null
}

/** A period from two `YYYY-MM-DD` days, both included. */
export function parseReportPeriod(from: unknown, to: unknown): PeriodResult {
  const start = parseDay(from)
  const last = parseDay(to)
  if (!start || !last || start > last) return { ok: false, code: 'reportPeriodInvalid' }
  const days = Math.round((last.getTime() - start.getTime()) / DAY_MS) + 1
  if (days > REPORT_MAX_DAYS) return { ok: false, code: 'reportPeriodTooLong' }
  return { ok: true, period: { from: start, to: last, end: new Date(last.getTime() + DAY_MS) } }
}

/** Last calendar month — what an accountant asks for at the start of this one. */
export function defaultReportPeriod(now: Date = new Date()): ReportPeriod {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { from, to: new Date(end.getTime() - DAY_MS), end }
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export function inPeriod(date: Date, period: ReportPeriod): boolean {
  return date >= period.from && date < period.end
}

// ─── Who was driving ────────────────────────────────────────────────────

export interface AssignmentSpan {
  vehicleId: string
  driverName: string
  startedAt: Date
  endedAt: Date | null
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/**
 * Who was assigned the vehicle on a day. Costs are dated by the day and
 * assignments to the minute, so a handover day has both drivers — both are
 * named, rather than one picked by a guess about the hour.
 */
export function driversOn(assignments: AssignmentSpan[], vehicleId: string, date: Date): string[] {
  const day = startOfDay(date).getTime()
  const names: string[] = []
  for (const a of [...assignments].sort((x, y) => x.startedAt.getTime() - y.startedAt.getTime())) {
    if (a.vehicleId !== vehicleId) continue
    if (startOfDay(a.startedAt).getTime() > day) continue
    if (a.endedAt && startOfDay(a.endedAt).getTime() < day) continue
    if (!names.includes(a.driverName)) names.push(a.driverName)
  }
  return names
}

/** Everyone assigned the vehicle at any point in the period. */
export function driversIn(assignments: AssignmentSpan[], vehicleId: string, period: ReportPeriod): string[] {
  const names: string[] = []
  for (const a of [...assignments].sort((x, y) => x.startedAt.getTime() - y.startedAt.getTime())) {
    if (a.vehicleId !== vehicleId) continue
    if (a.startedAt >= period.end) continue
    if (a.endedAt && a.endedAt < period.from) continue
    if (!names.includes(a.driverName)) names.push(a.driverName)
  }
  return names
}

// ─── Jobs ───────────────────────────────────────────────────────────────

export interface ReportJob {
  id: string
  vehicleId: string
  date: Date
  name: string
  category: string
  status: string
  notes: string | null
  workType: 'DIY' | 'WORKSHOP'
  workshopName: string | null
  costRon: number | null
  partsCostRon: number | null
  labourCostRon: number | null
  /** Null when the account that logged it no longer exists. */
  loggedBy: string | null
}

export interface JobRow extends ReportJob {
  total: number
  drivers: string[]
}

/** The period's jobs, oldest first, each with its total and who was driving. */
export function jobRows(jobs: ReportJob[], assignments: AssignmentSpan[], period: ReportPeriod, vehicleOrder: string[]): JobRow[] {
  const order = new Map(vehicleOrder.map((id, i) => [id, i]))
  return jobs
    .filter((job) => inPeriod(job.date, period))
    .map((job) => ({ ...job, total: taskTotalCost(job), drivers: driversOn(assignments, job.vehicleId, job.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || (order.get(a.vehicleId) ?? 0) - (order.get(b.vehicleId) ?? 0))
}

// ─── Costs ──────────────────────────────────────────────────────────────

export interface CostRow extends CostLine {
  vehicleId: string
  drivers: string[]
}

/** Every cost line in the period — the vehicle costs page's lines — with who was driving that day. */
export function costRows(inputs: OwnershipInput[], assignments: AssignmentSpan[], period: ReportPeriod): CostRow[] {
  const rows: CostRow[] = []
  for (const input of inputs) {
    for (const line of costLines(input)) {
      if (!inPeriod(line.date, period)) continue
      rows.push({ ...line, vehicleId: input.vehicleId, drivers: driversOn(assignments, input.vehicleId, line.date) })
    }
  }
  const order = new Map(inputs.map((input, i) => [input.vehicleId, i]))
  return rows.sort((a, b) => (order.get(a.vehicleId) ?? 0) - (order.get(b.vehicleId) ?? 0) || a.date.getTime() - b.date.getTime())
}

export interface VehicleSpend {
  vehicleId: string
  total: number
  /** Without the purchase — what running it cost. */
  running: number
  lines: number
  drivers: string[]
}

export interface CategorySpend {
  category: CostCategory
  total: number
  lines: number
}

export interface SpendSummary {
  vehicles: VehicleSpend[]
  categories: CategorySpend[]
  total: number
  running: number
}

/** Spend per vehicle and per category, from the same rows as the cost CSV. */
export function spendSummary(rows: CostRow[], vehicleIds: string[], assignments: AssignmentSpan[], period: ReportPeriod): SpendSummary {
  const vehicles = vehicleIds.map((vehicleId) => {
    const mine = rows.filter((r) => r.vehicleId === vehicleId)
    return {
      vehicleId,
      total: round2(mine.reduce((s, r) => s + r.amount, 0)),
      running: round2(mine.filter((r) => r.source !== 'purchase').reduce((s, r) => s + r.amount, 0)),
      lines: mine.length,
      drivers: driversIn(assignments, vehicleId, period),
    }
  })
  const categories = COST_CATEGORIES.map((category) => {
    const mine = rows.filter((r) => r.category === category)
    return { category, total: round2(mine.reduce((s, r) => s + r.amount, 0)), lines: mine.length }
  }).filter((c) => c.lines > 0)
  return {
    vehicles,
    categories,
    total: round2(rows.reduce((s, r) => s + r.amount, 0)),
    running: round2(rows.filter((r) => r.source !== 'purchase').reduce((s, r) => s + r.amount, 0)),
  }
}

// ─── Compliance events ──────────────────────────────────────────────────

export interface ReportDocument {
  id: string
  vehicleId: string
  type: string
  expiryDate: Date
  renewals: Array<{ previousExpiry: Date; newExpiry: Date; renewedAt: Date }>
}

export type ExpiryOutcome =
  /** Renewed after it had lapsed; `lapsedDays` it was out of date. */
  | { kind: 'renewedLate'; renewedAt: Date; lapsedDays: number }
  /** Not renewed, but a later document of the same type is on record. */
  | { kind: 'newerOnRecord' }
  /** Nothing after it on record. */
  | { kind: 'notRenewed' }

export interface ExpiryEvent {
  vehicleId: string
  type: FleetDocumentType
  expiredOn: Date
  outcome: ExpiryOutcome
}

export interface RenewalEvent {
  vehicleId: string
  type: FleetDocumentType
  renewedAt: Date
  previousExpiry: Date
  newExpiry: Date
  /** Days it had been out of date when renewed; 0 when renewed in time. */
  lapsedDays: number
}

export interface ComplianceEvents {
  expiries: ExpiryEvent[]
  renewals: RenewalEvent[]
}

const isFleetType = (type: string): type is FleetDocumentType => (FLEET_DOCUMENT_TYPES as readonly string[]).includes(type)
const lapsed = (expiry: Date, renewedAt: Date) => Math.max(0, Math.round((startOfDay(renewedAt).getTime() - startOfDay(expiry).getTime()) / DAY_MS))

/**
 * What expired and what was renewed in the period, for the documents a
 * fleet is stopped for. An expiry counts once its day is over — one later
 * in the period, still ahead today, has not happened. An expiry the
 * document was renewed ahead of never lapsed, so it is not listed as one;
 * its renewal is.
 *
 * Renewals are known only from when RigLog began recording them
 * (`DocumentRenewal`); an expiry moved on before that is not in the row
 * any more, so it is absent here rather than reported as anything.
 */
export function complianceEvents(documents: ReportDocument[], period: ReportPeriod, now: Date = new Date()): ComplianceEvents {
  const expiries: ExpiryEvent[] = []
  const renewals: RenewalEvent[] = []
  // A document is valid through its expiry day, so it has lapsed once
  // that day is over — not on it.
  const happened = (d: Date) => inPeriod(d, period) && startOfDay(d) < startOfDay(now)

  for (const doc of documents) {
    if (!isFleetType(doc.type)) continue
    const type = doc.type
    for (const r of doc.renewals) {
      const lapsedDays = lapsed(r.previousExpiry, r.renewedAt)
      if (inPeriod(r.renewedAt, period)) {
        renewals.push({ vehicleId: doc.vehicleId, type, renewedAt: r.renewedAt, previousExpiry: r.previousExpiry, newExpiry: r.newExpiry, lapsedDays })
      }
      if (happened(r.previousExpiry) && lapsedDays > 0) {
        expiries.push({ vehicleId: doc.vehicleId, type, expiredOn: r.previousExpiry, outcome: { kind: 'renewedLate', renewedAt: r.renewedAt, lapsedDays } })
      }
    }
    if (happened(doc.expiryDate)) {
      const newer = documents.some((d) => d.id !== doc.id && d.vehicleId === doc.vehicleId && d.type === type && d.expiryDate > doc.expiryDate)
      expiries.push({ vehicleId: doc.vehicleId, type, expiredOn: doc.expiryDate, outcome: newer ? { kind: 'newerOnRecord' } : { kind: 'notRenewed' } })
    }
  }
  expiries.sort((a, b) => a.expiredOn.getTime() - b.expiredOn.getTime())
  renewals.sort((a, b) => a.renewedAt.getTime() - b.renewedAt.getTime())
  return { expiries, renewals }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
