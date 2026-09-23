/**
 * RL-045 (phase 5 slice 5 of #49): the true cost of owning one vehicle.
 *
 * ## A union, not a ledger
 *
 * Cost stays on the thing it describes — a service invoice on its Task, a
 * fill-up on its FuelEntry, a premium on its Document, a set of tyres on
 * its TyreSet, the purchase and the finance on the Vehicle — and this
 * module is the only place they are added up. The long tail with no better
 * home (road tax, tolls, parking…) is a VehicleExpense. Task cost goes
 * through `taskTotalCost()`, the same function as the analytics page, both
 * PDFs and the dashboard total, so none of them can disagree with this.
 *
 * `MONEY_COLUMNS` lists every money column in the schema and what happens
 * to it here; `ownershipCosts.test.ts` reads the schema and fails when a
 * new one appears that this module has not decided about. That is what
 * stops a cost source from being added and silently left out of the total.
 *
 * ## Honest about what it does not know
 *
 * - Nothing is estimated. **Depreciation is not a cost line**: the owner's
 *   own dated estimate of the current value is shown beside the total,
 *   labelled as theirs, never folded into it (RL-050: RigLog has no
 *   valuation data and must not invent a value).
 * - Cost per km is measured only over the stretch the odometer actually
 *   covers inside the period, and only with the costs paid inside that
 *   stretch — never a lifetime average passed off as "now".
 * - `coverage` names every gap that makes the total smaller than the truth:
 *   no purchase price, fuel logged for only part of the period, documents
 *   with no price, km known for only part of it.
 */

import { taskTotalCost, rangeCutoff, type CostTaskLike, type DateRange } from './analytics'
import { distanceCovered, dayKey, startOfDayUtc, type ReadingLike } from './odometer'
import { COST_CATEGORIES, isExpenseKind, isFinanceType, type CostCategory, type ExpenseKind, type FinanceType } from './costKinds'

export { COST_CATEGORIES, EXPENSE_KINDS, FINANCE_TYPES, isExpenseKind, isFinanceType } from './costKinds'
export type { CostCategory, ExpenseKind, FinanceType } from './costKinds'

/** Where a cost line came from — and where it links to. */
export type CostSource = 'task' | 'fuel' | 'document' | 'tyreSet' | 'expense' | 'purchase' | 'finance'

/**
 * Every money column in `prisma/schema.prisma`, and what this module does
 * with it: the source that counts it, or why it is deliberately left out.
 * The test fails on a column missing from here.
 */
export const MONEY_COLUMNS: Record<string, CostSource | { excluded: string }> = {
  'Task.costRon': 'task',
  'Task.partsCostRon': 'task',
  'Task.labourCostRon': 'task',
  'FuelEntry.totalRon': 'fuel',
  'Document.costRon': 'document',
  'TyreSet.costRon': 'tyreSet',
  'VehicleExpense.amountRon': 'expense',
  'Vehicle.purchasePriceRon': 'purchase',
  'Vehicle.financeMonthlyRon': 'finance',
  'Vehicle.currentValueRon': { excluded: "the owner's estimate of what the vehicle is worth — shown beside the total, never a cost" },
  'FoundState.purchasePriceRon': { excluded: 'a mirror of Vehicle.purchasePriceRon, kept until a later release drops it' },
  'WishlistItem.estimatedCostRon': { excluded: 'planned, not spent — it counts once it becomes a job' },
  'WishlistItem.targetPriceRon': { excluded: 'a price the owner hopes to pay' },
  'WishlistPriceEntry.priceRon': { excluded: 'a price seen on a listing, not paid' },
  'Accident.repairCostRon': { excluded: 'the repair is logged as a job, which is already counted; this is what the owner noted on the accident' },
  'Donation.amountBani': { excluded: 'given to RigLog, not spent on a vehicle' },
}

/** Insurance, inspection and road-charge documents; the kit is "other". */
const DOCUMENT_CATEGORY: Record<string, CostCategory> = {
  RCA: 'insurance',
  CASCO: 'insurance',
  ITP: 'inspection',
  ROVINIETA: 'roadCharges',
  VIGNETTE: 'roadCharges',
}

const EXPENSE_CATEGORY: Record<ExpenseKind, CostCategory> = {
  TAX: 'roadCharges',
  TOLL: 'roadCharges',
  ROAD_CHARGE: 'roadCharges',
  INSURANCE: 'insurance',
  INSPECTION: 'inspection',
  PARKING: 'other',
  WASH: 'other',
  FINE: 'other',
  OTHER: 'other',
}

/**
 * A document is renewed in place — its expiry moves on — so the price paid
 * for the period that just ended would be overwritten by the next one. On
 * a renewal it is kept as an expense instead, in the same category, so the
 * cost of ownership still counts every year's premium.
 */
export function archivedDocumentCost(document: {
  type: string
  costRon: number | null
  paidAt: Date | null
  createdAt: Date
}): { date: Date; kind: ExpenseKind; amountRon: number; note: string | null } | null {
  if (!document.costRon || document.costRon <= 0) return null
  const category = DOCUMENT_CATEGORY[document.type] ?? 'other'
  const kind: ExpenseKind =
    category === 'insurance' ? 'INSURANCE' : category === 'inspection' ? 'INSPECTION' : category === 'roadCharges' ? 'ROAD_CHARGE' : 'OTHER'
  return {
    date: startOfDayUtc(document.paidAt ?? document.createdAt),
    kind,
    amountRon: document.costRon,
    note: DOCUMENT_NOTE[document.type] ?? null,
  }
}

/** What an archived premium is called in the expense list: its document's own name. */
const DOCUMENT_NOTE: Record<string, string> = {
  ITP: 'ITP',
  RCA: 'RCA',
  CASCO: 'CASCO',
  ROVINIETA: 'Rovinietă',
}

export interface Message {
  key: string
  values?: Record<string, string | number>
}

export interface CostLine {
  source: CostSource
  /** The row behind it; for finance, the payment's month. */
  id: string
  date: Date
  amount: number
  category: CostCategory
  /** Text the owner typed (a job's name, a note), when there is one. */
  text: string | null
  /** A catalogue key for the rest (a document type, an expense kind). */
  labelKey: string
  href: string
}

export interface OwnershipInput {
  vehicleId: string
  projectType: string
  now: Date
  vehicle: {
    createdAt: Date
    purchaseDate: Date | null
    purchasePriceRon: number | null
    currentValueRon: number | null
    currentValueAt: Date | null
    financeType: string | null
    financeMonthlyRon: number | null
    financeStartDate: Date | null
    financeEndDate: Date | null
  }
  tasks: Array<CostTaskLike & { id: string; name: string }>
  fuel: Array<{ id: string; date: Date; totalRon: number; station: string | null }>
  documents: Array<{ id: string; type: string; costRon: number | null; paidAt: Date | null; createdAt: Date }>
  tyreSets: Array<{ id: string; season: string; label: string | null; costRon: number | null; purchasedAt: Date | null; fittedAt: Date | null; createdAt: Date }>
  expenses: Array<{ id: string; date: Date; kind: string; amountRon: number; note: string | null }>
  readings: Array<ReadingLike & { id: string }>
}

/**
 * Monthly finance payments from the start date, one a month on the same
 * day, until the end date or today, whichever is first. A payment is due on
 * its day; nothing in the future is counted. No finance type, no payments —
 * the amounts left behind by switching it off do not count.
 */
export function financePayments(
  vehicle: OwnershipInput['vehicle'],
  now: Date
): Date[] {
  const { financeType, financeMonthlyRon, financeStartDate, financeEndDate } = vehicle
  if (!financeType || !financeMonthlyRon || !financeStartDate) return []
  const last = financeEndDate && financeEndDate < now ? financeEndDate : now
  const dates: Date[] = []
  const day = financeStartDate.getUTCDate()
  for (let i = 0; i < 1200; i++) {
    const y = financeStartDate.getUTCFullYear()
    const m = financeStartDate.getUTCMonth() + i
    // Clamp the 31st to the last day of a shorter month.
    const lastOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const date = new Date(Date.UTC(y, m, Math.min(day, lastOfMonth)))
    if (date > last) break
    dates.push(date)
  }
  return dates
}

/** Every cost the vehicle has, whatever its date. */
export function costLines(input: OwnershipInput): CostLine[] {
  const base = `/dashboard/vehicles/${input.vehicleId}`
  const lines: CostLine[] = []

  for (const task of input.tasks) {
    const amount = taskTotalCost(task)
    if (amount > 0) {
      lines.push({ source: 'task', id: task.id, date: task.date, amount, category: 'work', text: task.name, labelKey: 'source.task', href: `${base}/tasks/${task.id}` })
    }
  }
  for (const entry of input.fuel) {
    if (entry.totalRon > 0) {
      lines.push({ source: 'fuel', id: entry.id, date: entry.date, amount: entry.totalRon, category: 'fuel', text: entry.station, labelKey: 'source.fuel', href: `${base}/fuel` })
    }
  }
  for (const doc of input.documents) {
    if (doc.costRon && doc.costRon > 0) {
      lines.push({
        source: 'document',
        id: doc.id,
        date: doc.paidAt ?? doc.createdAt,
        amount: doc.costRon,
        category: DOCUMENT_CATEGORY[doc.type] ?? 'other',
        text: null,
        labelKey: `doc.${doc.type}`,
        href: `${base}/documents`,
      })
    }
  }
  for (const set of input.tyreSets) {
    if (set.costRon && set.costRon > 0) {
      lines.push({
        source: 'tyreSet',
        id: set.id,
        date: set.purchasedAt ?? set.fittedAt ?? set.createdAt,
        amount: set.costRon,
        category: 'tyres',
        text: set.label,
        labelKey: `season.${set.season}`,
        href: `${base}/tyres`,
      })
    }
  }
  for (const expense of input.expenses) {
    if (expense.amountRon > 0) {
      lines.push({
        source: 'expense',
        id: expense.id,
        date: expense.date,
        amount: expense.amountRon,
        category: isExpenseKind(expense.kind) ? EXPENSE_CATEGORY[expense.kind] : 'other',
        text: expense.note,
        labelKey: `kind.${expense.kind}`,
        href: `${base}/expenses`,
      })
    }
  }
  const v = input.vehicle
  if (v.purchasePriceRon && v.purchasePriceRon > 0) {
    lines.push({
      source: 'purchase',
      id: 'purchase',
      date: v.purchaseDate ?? v.createdAt,
      amount: v.purchasePriceRon,
      category: 'purchase',
      text: null,
      labelKey: 'source.purchase',
      href: `${base}/edit#values`,
    })
  }
  for (const date of financePayments(v, input.now)) {
    lines.push({
      source: 'finance',
      id: `finance:${dayKey(date)}`,
      date,
      amount: v.financeMonthlyRon!,
      category: 'finance',
      text: null,
      labelKey: `finance.${isFinanceType(v.financeType) ? v.financeType : 'CREDIT'}`,
      href: `${base}/edit#values`,
    })
  }
  return lines.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export interface CategoryTotal {
  category: CostCategory
  total: number
  count: number
}

export interface PerKm {
  /** RON per km, running costs only (the purchase is not a running cost). */
  value: number
  km: number
  costs: number
  from: Date
  to: Date
}

export interface OwnershipReport {
  range: DateRange
  from: Date
  to: Date
  lines: CostLine[]
  categories: CategoryTotal[]
  total: number
  /** The total without the purchase — what running it has cost. */
  runningTotal: number
  perKm: PerKm | null
  /** Why there is no cost per km, when there is none. */
  perKmMissing: Message | null
  /** What the total does not know. Empty only when nothing is missing. */
  coverage: Message[]
  /** The owner's estimate, never computed, never added to the total. */
  value: { currentValueRon: number; at: Date | null; purchasePriceRon: number | null } | null
}

const DAY_MS = 86_400_000
const days = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS))

/**
 * When ownership started: the purchase date, else the earliest thing
 * recorded, else when the vehicle was added.
 */
export function ownershipStart(input: OwnershipInput, lines: CostLine[]): Date {
  if (input.vehicle.purchaseDate) return startOfDayUtc(input.vehicle.purchaseDate)
  const dates = [input.vehicle.createdAt, ...lines.map((l) => l.date), ...input.readings.map((r) => r.readAt)]
  return startOfDayUtc(new Date(Math.min(...dates.map((d) => d.getTime()))))
}

export function ownershipReport(input: OwnershipInput, range: DateRange): OwnershipReport {
  const all = costLines(input)
  const start = ownershipStart(input, all)
  const cutoff = rangeCutoff(range, input.now)
  const from = cutoff && cutoff > start ? startOfDayUtc(cutoff) : start
  const to = input.now
  const lines = all.filter((l) => l.date >= from && l.date <= to)

  const categories = COST_CATEGORIES.map((category) => {
    const mine = lines.filter((l) => l.category === category)
    return { category, total: round2(mine.reduce((s, l) => s + l.amount, 0)), count: mine.length }
  })
  const total = round2(lines.reduce((s, l) => s + l.amount, 0))
  const runningTotal = round2(lines.filter((l) => l.source !== 'purchase').reduce((s, l) => s + l.amount, 0))

  // Cost per km: only the stretch the odometer covers inside the period,
  // and only what was paid inside that stretch. Fuel bought on the first
  // reading's day is burnt in the stretch; on the last day's, after it.
  const readings = input.readings.filter((r) => r.readAt >= from && r.readAt <= to)
  const km = distanceCovered(readings)
  let perKm: PerKm | null = null
  let perKmMissing: Message | null = null
  if (readings.length < 2) {
    perKmMissing = { key: 'perKm.fewReadings' }
  } else if (km <= 0) {
    perKmMissing = { key: 'perKm.noDistance' }
  } else {
    const times = readings.map((r) => r.readAt.getTime())
    const windowFrom = new Date(Math.min(...times))
    const windowTo = new Date(Math.max(...times))
    const costs = round2(
      lines.filter((l) => l.source !== 'purchase' && l.date >= windowFrom && l.date < windowTo).reduce((s, l) => s + l.amount, 0)
    )
    perKm = { value: costs / km, km, costs, from: windowFrom, to: windowTo }
  }

  const coverage: Message[] = []
  const periodDays = days(from, to)
  if (range === 'all' && !input.vehicle.purchasePriceRon) coverage.push({ key: 'coverage.noPurchase' })
  if (perKm && periodDays > 0 && days(perKm.from, perKm.to) < periodDays * 0.9) {
    coverage.push({
      key: 'coverage.kmWindow',
      values: { from: dayKey(perKm.from), to: dayKey(perKm.to), days: days(perKm.from, perKm.to), periodDays },
    })
  }
  if (input.projectType !== 'RESTORATION') {
    const fuel = lines.filter((l) => l.source === 'fuel')
    if (fuel.length === 0) {
      coverage.push({ key: 'coverage.noFuel' })
    } else {
      const first = fuel[fuel.length - 1].date
      if (days(from, first) > 31) coverage.push({ key: 'coverage.fuelSince', values: { date: dayKey(first) } })
    }
  }
  const unpriced = input.documents.filter((d) => d.costRon == null).length
  if (unpriced > 0) coverage.push({ key: 'coverage.documentsWithoutPrice', values: { count: unpriced } })
  if (input.vehicle.financeType === 'CREDIT' && input.vehicle.purchasePriceRon && input.vehicle.financeMonthlyRon) {
    coverage.push({ key: 'coverage.creditAndPurchase' })
  }
  if (input.vehicle.financeType && (!input.vehicle.financeMonthlyRon || !input.vehicle.financeStartDate)) {
    coverage.push({ key: 'coverage.financeIncomplete' })
  }

  const value =
    input.vehicle.currentValueRon != null
      ? { currentValueRon: input.vehicle.currentValueRon, at: input.vehicle.currentValueAt, purchasePriceRon: input.vehicle.purchasePriceRon }
      : null

  return { range, from, to, lines, categories, total, runningTotal, perKm, perKmMissing, coverage, value }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Input parsing ──────────────────────────────────────────────────────

export const NOTE_MAX = 200
export const AMOUNT_MAX = 10_000_000

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/**
 * An optional amount: null for blank, false for invalid. Accepts a decimal
 * comma. The same rules as amounts.ts's parseAmount (only a number or a
 * numeric string, never negative), restated because this module is
 * imported by client components (via tyres.ts) and amounts.ts reaches the
 * request headers.
 */
function amount(value: unknown): number | null | false {
  if (blank(value)) return null
  if (typeof value !== 'number' && typeof value !== 'string') return false
  const n = Number(typeof value === 'string' ? value.trim().replace(',', '.') : value)
  if (!Number.isFinite(n) || n < 0 || n > AMOUNT_MAX) return false
  return round2(n)
}

/** An optional past-or-today date: null for blank, false for invalid. */
function pastDay(value: unknown, now: Date): Date | null | false {
  if (blank(value)) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1886) return false
  if (startOfDayUtc(date) > startOfDayUtc(now)) return false
  return startOfDayUtc(date)
}

// Shared with the other money forms (accidents.ts) so a RON amount and a
// past day mean the same thing everywhere.
export { amount as parseAmountRon, pastDay as parsePastDay }

function anyDay(value: unknown): Date | null | false {
  if (blank(value)) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1886) return false
  return startOfDayUtc(date)
}

export type ValuesField =
  | 'purchaseDate'
  | 'purchasePriceRon'
  | 'currentValueRon'
  | 'financeType'
  | 'financeMonthlyRon'
  | 'financeStartDate'
  | 'financeEndDate'

export type ValuesData = Partial<{
  purchaseDate: Date | null
  purchasePriceRon: number | null
  currentValueRon: number | null
  currentValueAt: Date | null
  financeType: FinanceType | null
  financeMonthlyRon: number | null
  financeStartDate: Date | null
  financeEndDate: Date | null
}>

/**
 * The values and finance fields of a vehicle PATCH. Only fields sent are
 * returned. A new current value is stamped with today — an estimate
 * without a date is not worth reading.
 */
export function parseValues(
  body: Record<string, unknown>,
  current: { financeStartDate: Date | null; financeEndDate: Date | null; currentValueRon: number | null },
  now: Date = new Date()
): { ok: true; data: ValuesData } | { ok: false; field: ValuesField } {
  const data: ValuesData = {}

  for (const field of ['purchasePriceRon', 'currentValueRon', 'financeMonthlyRon'] as const) {
    if (body[field] === undefined) continue
    const n = amount(body[field])
    if (n === false) return { ok: false, field }
    data[field] = n
  }
  if (data.currentValueRon !== undefined && data.currentValueRon !== current.currentValueRon) {
    data.currentValueAt = data.currentValueRon == null ? null : startOfDayUtc(now)
  }

  if (body.purchaseDate !== undefined) {
    const d = pastDay(body.purchaseDate, now)
    if (d === false) return { ok: false, field: 'purchaseDate' }
    data.purchaseDate = d
  }
  if (body.financeType !== undefined) {
    if (blank(body.financeType)) data.financeType = null
    else if (isFinanceType(body.financeType)) data.financeType = body.financeType
    else return { ok: false, field: 'financeType' }
  }
  // The start is a day payments began, so not in the future; the end of a
  // contract usually is.
  if (body.financeStartDate !== undefined) {
    const d = pastDay(body.financeStartDate, now)
    if (d === false) return { ok: false, field: 'financeStartDate' }
    data.financeStartDate = d
  }
  if (body.financeEndDate !== undefined) {
    const d = anyDay(body.financeEndDate)
    if (d === false) return { ok: false, field: 'financeEndDate' }
    data.financeEndDate = d
  }
  const start = data.financeStartDate !== undefined ? data.financeStartDate : current.financeStartDate
  const end = data.financeEndDate !== undefined ? data.financeEndDate : current.financeEndDate
  if (start && end && end < start) return { ok: false, field: 'financeEndDate' }

  return { ok: true, data }
}

export type CostPaidField = 'costRon' | 'paidAt'

/**
 * A document's or tyre set's price and when it was paid. A price with no
 * date is dated today — the day somebody is most likely to type it in is
 * the day they paid it.
 */
export function parseCostPaid<D extends 'paidAt' | 'purchasedAt'>(
  body: Record<string, unknown>,
  dateField: D,
  /** The row's current date, on an edit — an existing date is never replaced by the default. */
  existingDate: Date | null = null,
  now: Date = new Date()
): { ok: true; data: Record<string, number | Date | null> } | { ok: false; field: 'costRon' | D } {
  const data: Record<string, number | Date | null> = {}
  if (body.costRon !== undefined) {
    const n = amount(body.costRon)
    if (n === false) return { ok: false, field: 'costRon' }
    data.costRon = n
  }
  if (body[dateField] !== undefined) {
    const d = pastDay(body[dateField], now)
    if (d === false) return { ok: false, field: dateField }
    data[dateField] = d
  }
  if (typeof data.costRon === 'number' && body[dateField] === undefined && existingDate == null) {
    data[dateField] = startOfDayUtc(now)
  }
  return { ok: true, data }
}

export type ExpenseField = 'date' | 'kind' | 'amountRon' | 'note'

export function parseExpense(
  body: Record<string, unknown>,
  now: Date = new Date()
): { ok: true; data: { date: Date; kind: ExpenseKind; amountRon: number; note: string | null } } | { ok: false; field: ExpenseField } {
  if (!isExpenseKind(body.kind)) return { ok: false, field: 'kind' }
  const n = amount(body.amountRon)
  if (n === false || n === null || n <= 0) return { ok: false, field: 'amountRon' }
  const date = blank(body.date) ? startOfDayUtc(now) : pastDay(body.date, now)
  if (!date) return { ok: false, field: 'date' }
  let note: string | null = null
  if (!blank(body.note)) {
    if (typeof body.note !== 'string' || body.note.trim().length > NOTE_MAX) return { ok: false, field: 'note' }
    note = body.note.trim()
  }
  return { ok: true, data: { date, kind: body.kind, amountRon: n, note } }
}
