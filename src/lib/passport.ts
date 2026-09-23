/**
 * RL-049 (phase 5 slice 7 of #49): the Vehicle Passport — the history a
 * seller hands a buyer.
 *
 * It is the first thing RigLog produces that can move somebody else's
 * money, so the rules here are the point of the module, and each is tested:
 *
 * - **It never claims to be a vehicle history report.** It is the owner's
 *   own records and says so in its heading (the catalogue's `passport.what`),
 *   not in a footnote.
 * - **Every absence is an absence of records.** Nothing here can say "no
 *   accidents" or "no problems": only "no … recorded in RigLog". Accidents
 *   are not tracked at all yet, and the passport says exactly that rather
 *   than implying a clean record (`absences` always carries it).
 * - **Gaps are shown as gaps.** A stretch of a year or more with no job,
 *   reading or fill-up is listed, so a history that looks complete because
 *   nothing was logged cannot pass as complete.
 * - **When an entry was written is shown beside when the work was done**,
 *   and when it was last changed if that was later. The rule is stated on
 *   the document (`passport.datesRule`).
 * - Plate, VIN and costs appear only when the owner chose them for the
 *   link (RL-050: identifying fields are asked for, never assumed).
 *
 * Pure, like computeHealth(): the pages and the PDF build from its output
 * and never re-derive any of it.
 */

import { distanceCovered, type ReadingLike } from './odometer'
import { getDocumentStatus, type DocumentStatus } from './documents'
import type { ServiceRow } from './serviceBook'

/** A stretch this long with nothing recorded is listed as a gap. */
export const GAP_DAYS = 365
const DAY_MS = 86_400_000

export interface Message {
  key: string
  values?: Record<string, string | number>
}

export interface PassportOptions {
  showPlate: boolean
  showVin: boolean
  showCosts: boolean
}

export interface PassportInput {
  now: Date
  projectType: string
  options: PassportOptions
  vehicle: {
    year: number
    make: string
    model: string
    generation: string | null
    plate: string | null
    vin: string | null
    purchaseDate: Date | null
    createdAt: Date
  }
  rows: ServiceRow[]
  readings: Array<ReadingLike & { overrideReason?: string | null }>
  fuelDates: Date[]
  documents: Array<{ type: string; expiryDate: Date }>
  tyreSets: Array<{ season: string; label: string | null; isFitted: boolean; dotYear: number | null }>
}

export interface Passport {
  name: string
  plate: string | null
  vin: string | null
  span: { from: Date; fromPurchase: boolean; to: Date }
  mileage: {
    first: { km: number; date: Date } | null
    latest: { km: number; date: Date } | null
    distance: number
    /** Replaced clusters and corrections — each restarts the count. */
    resets: number
  }
  jobs: { count: number; spend: number | null; rows: ServiceRow[] }
  documents: Array<{ type: string; expiryDate: Date; status: DocumentStatus }>
  tyres: { count: number; fitted: { season: string; label: string | null; dotYear: number | null } | null }
  gaps: Array<{ from: Date; to: Date; days: number }>
  /** What is not in the records, each phrased as an absence of records. */
  absences: Message[]
}

const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS)

/**
 * Stretches with no activity of a year or more, from the start of the
 * span to today — including before the first entry and after the last.
 */
export function recordGaps(activity: Date[], from: Date, to: Date, minDays = GAP_DAYS): Array<{ from: Date; to: Date; days: number }> {
  const points = [from, ...activity.filter((d) => d >= from && d <= to).sort((a, b) => a.getTime() - b.getTime()), to]
  const gaps: Array<{ from: Date; to: Date; days: number }> = []
  for (let i = 1; i < points.length; i++) {
    const length = days(points[i - 1], points[i])
    if (length >= minDays) gaps.push({ from: points[i - 1], to: points[i], days: length })
  }
  return gaps
}

export function buildPassport(input: PassportInput): Passport {
  const { vehicle, options, now } = input
  const readings = [...input.readings].sort((a, b) => a.readAt.getTime() - b.readAt.getTime())
  const activity = [...input.rows.map((r) => r.date), ...readings.map((r) => r.readAt), ...input.fuelDates]

  const firstRecord = activity.length ? new Date(Math.min(...activity.map((d) => d.getTime()))) : vehicle.createdAt
  const from = vehicle.purchaseDate ?? (firstRecord < vehicle.createdAt ? firstRecord : vehicle.createdAt)

  const first = readings[0] ?? null
  const latest = readings[readings.length - 1] ?? null

  const absences: Message[] = []
  if (input.rows.length === 0) absences.push({ key: 'absence.noJobs' })
  if (readings.length === 0) absences.push({ key: 'absence.noMileage' })
  if (input.documents.length === 0) absences.push({ key: 'absence.noDocuments' })
  if (input.projectType !== 'RESTORATION' && input.tyreSets.length === 0) absences.push({ key: 'absence.noTyres' })
  // Always: RigLog has nowhere to record an accident yet, so the passport
  // can say nothing about one either way — and must say that it cannot.
  absences.push({ key: 'absence.accidentsNotTracked' })

  const fitted = input.tyreSets.find((s) => s.isFitted) ?? null

  return {
    name: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.generation ? ` (${vehicle.generation})` : ''}`,
    plate: options.showPlate ? vehicle.plate : null,
    vin: options.showVin ? vehicle.vin : null,
    span: { from, fromPurchase: vehicle.purchaseDate !== null, to: now },
    mileage: {
      first: first ? { km: first.km, date: first.readAt } : null,
      latest: latest ? { km: latest.km, date: latest.readAt } : null,
      distance: distanceCovered(readings),
      resets: readings.filter((r) => r.isOverride).length,
    },
    jobs: {
      count: input.rows.length,
      spend: options.showCosts ? Math.round(input.rows.reduce((s, r) => s + r.cost, 0) * 100) / 100 : null,
      rows: options.showCosts ? input.rows : input.rows.map((r) => ({ ...r, cost: 0 })),
    },
    documents: input.documents
      .map((d) => ({ type: d.type, expiryDate: d.expiryDate, status: getDocumentStatus(d.expiryDate, now).status }))
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime()),
    tyres: {
      count: input.tyreSets.length,
      fitted: fitted ? { season: fitted.season, label: fitted.label, dotYear: fitted.dotYear } : null,
    },
    gaps: recordGaps(activity, from, now),
    absences,
  }
}
