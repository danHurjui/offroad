import { distanceCovered, type ReadingLike } from './odometer'

/**
 * RL-051: trips, for the monthly trip sheet (foaie de parcurs). Pure; the
 * routes and pages load the rows.
 *
 * - **Distance is derived, never typed**: a trip's two ends are
 *   OdometerReadings in the vehicle's one history (source TRIP), so the
 *   trip sheet and the mileage history cannot disagree.
 * - **Business or personal, per trip.** That split is the whole fiscal
 *   point of the sheet.
 * - **Gaps are shown, not smoothed.** The km the odometer covered in the
 *   month that no trip accounts for — between two trips, before the first,
 *   after the last — is the thing an accountant needs to see, so it is
 *   reported as a number, and an odometer replaced in between makes it
 *   unknown rather than a guess.
 * - **Not an official document.** What ANAF requires on a foaie de parcurs
 *   has not been established here, so the export is a CSV that claims to be
 *   nothing more than the trips as recorded; the page says so.
 */

export const TRIP_KINDS = ['BUSINESS', 'PERSONAL'] as const
export type TripKind = (typeof TRIP_KINDS)[number]

export const PLACE_MAX = 120
export const PURPOSE_MAX = 200

export function isTripKind(value: unknown): value is TripKind {
  return typeof value === 'string' && (TRIP_KINDS as readonly string[]).includes(value)
}

export type TripField = 'fromPlace' | 'toPlace' | 'purpose' | 'kind'

export type TripText =
  | { ok: true; data: { fromPlace: string; toPlace: string; purpose: string | null; kind: TripKind } }
  | { ok: false; field: TripField }

/** The typed half of a trip; km and date are parsed with the odometer's own helpers. */
export function parseTripText(body: Record<string, unknown>): TripText {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  const fromPlace = text(body.fromPlace)
  if (!fromPlace || fromPlace.length > PLACE_MAX) return { ok: false, field: 'fromPlace' }
  const toPlace = text(body.toPlace)
  if (!toPlace || toPlace.length > PLACE_MAX) return { ok: false, field: 'toPlace' }
  const purpose = text(body.purpose)
  if (purpose.length > PURPOSE_MAX) return { ok: false, field: 'purpose' }
  if (!isTripKind(body.kind)) return { ok: false, field: 'kind' }
  return { ok: true, data: { fromPlace, toPlace, purpose: purpose || null, kind: body.kind } }
}

// ─── The month ──────────────────────────────────────────────────────────

export interface Month {
  /** `YYYY-MM`. */
  key: string
  /** 00:00 UTC on the 1st. */
  from: Date
  /** 00:00 UTC on the 1st of the next month (exclusive). */
  end: Date
}

function monthOf(year: number, monthIndex: number): Month {
  const from = new Date(Date.UTC(year, monthIndex, 1))
  return { key: from.toISOString().slice(0, 7), from, end: new Date(Date.UTC(year, monthIndex + 1, 1)) }
}

export function currentMonth(now: Date = new Date()): Month {
  return monthOf(now.getUTCFullYear(), now.getUTCMonth())
}

/** A `YYYY-MM` month, or null. */
export function parseMonth(value: unknown): Month | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  return m ? monthOf(Number(m[1]), Number(m[2]) - 1) : null
}

export function shiftMonth(month: Month, by: number): Month {
  return monthOf(month.from.getUTCFullYear(), month.from.getUTCMonth() + by)
}

// ─── The sheet ──────────────────────────────────────────────────────────

export interface TripLike {
  id: string
  date: Date
  kind: string
  createdAt: Date
  startKm: number | null
  endKm: number | null
}

/** The distance a trip covered, from its two readings; null if either is gone or they run backwards. */
export function tripDistance(trip: Pick<TripLike, 'startKm' | 'endKm'>): number | null {
  if (trip.startKm === null || trip.endKm === null || trip.endKm < trip.startKm) return null
  return trip.endKm - trip.startKm
}

const byTime = (a: TripLike, b: TripLike) =>
  a.date.getTime() - b.date.getTime() || (a.startKm ?? 0) - (b.startKm ?? 0) || a.createdAt.getTime() - b.createdAt.getTime()

/** In the order they were driven: by day, then by the km each started at. */
export function sortTrips<T extends TripLike>(trips: T[]): T[] {
  return [...trips].sort(byTime)
}

export interface TripGap {
  /** The trip the gap follows, or null for the stretch before the first. */
  afterTripId: string | null
  /** The trip it leads into, or null for the stretch after the last. */
  beforeTripId: string | null
  /** Km on the odometer between them that no trip covers; null when an odometer replacement or correction lies between. */
  km: number | null
}

export interface MonthReconciliation {
  business: number
  personal: number
  /** Trips whose distance cannot be read (a reading deleted since). */
  withoutDistance: number
  /**
   * What the odometer covered in the month: from the last reading before
   * it (or its first), to its last. Null with fewer than two readings.
   */
  odometer: { fromKm: number; fromDate: Date; toKm: number; toDate: Date; km: number } | null
  /** Odometer km no trip accounts for; null without an odometer figure. */
  unlogged: number | null
  /** Each stretch the odometer moved that no trip covers, in order; zero stretches are left out. */
  gaps: TripGap[]
}

/**
 * The month's trips against the odometer. `readings` is the vehicle's
 * whole history; trips are the month's (all of them — a driver's own view
 * reconciles nothing, since other people's trips fill their gaps).
 */
export function reconcileMonth(trips: TripLike[], readings: ReadingLike[], month: Month): MonthReconciliation {
  const sorted = sortTrips(trips)
  let business = 0
  let personal = 0
  let withoutDistance = 0
  for (const trip of sorted) {
    const km = tripDistance(trip)
    if (km === null) withoutDistance++
    else if (trip.kind === 'BUSINESS') business += km
    else personal += km
  }

  const chronological = [...readings].sort(
    (a, b) => a.readAt.getTime() - b.readAt.getTime() || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  )
  const before = chronological.filter((r) => r.readAt < month.from)
  const inside = chronological.filter((r) => r.readAt >= month.from && r.readAt < month.end)
  const span = [...before.slice(-1), ...inside]
  const odometer =
    span.length >= 2
      ? {
          fromKm: span[0].km,
          fromDate: span[0].readAt,
          toKm: span[span.length - 1].km,
          toDate: span[span.length - 1].readAt,
          km: distanceCovered(span),
        }
      : null

  // Between one trip's end and the next one's start — and the edges of the
  // month's odometer span — anything the clock moved is unlogged. Across a
  // replaced cluster or a correction the difference means nothing.
  const overrideBetween = (fromDate: Date, toDate: Date) =>
    span.some((r) => r.isOverride && r.readAt > fromDate && r.readAt <= toDate)
  const gaps: TripGap[] = []
  const push = (afterTripId: string | null, beforeTripId: string | null, fromKm: number | null, fromDate: Date, toKm: number | null, toDate: Date) => {
    if (fromKm === null || toKm === null) return
    const km = overrideBetween(fromDate, toDate) ? null : toKm - fromKm
    if (km !== 0) gaps.push({ afterTripId, beforeTripId, km })
  }
  const measured = sorted.filter((t) => tripDistance(t) !== null)
  if (odometer && measured.length > 0) {
    push(null, measured[0].id, odometer.fromKm, odometer.fromDate, measured[0].startKm, measured[0].date)
  }
  for (let i = 1; i < measured.length; i++) {
    const prev = measured[i - 1]
    const next = measured[i]
    push(prev.id, next.id, prev.endKm, prev.date, next.startKm, next.date)
  }
  if (odometer && measured.length > 0) {
    const last = measured[measured.length - 1]
    push(last.id, null, last.endKm, last.date, odometer.toKm, odometer.toDate)
  }

  return {
    business,
    personal,
    withoutDistance,
    odometer,
    unlogged: odometer ? odometer.km - business - personal : null,
    gaps,
  }
}

export interface FuelSplit {
  fuelRon: number
  perKm: number
  business: number
  personal: number
  unlogged: number
}

/**
 * The month's fuel, divided by distance: what it cost per km the odometer
 * covered, times the business, personal and unlogged km. An allocation by
 * distance, labelled as one — never a measurement of what each trip burnt.
 * Null without an odometer figure for the month.
 */
export function fuelSplit(fuelRon: number, reconciliation: MonthReconciliation): FuelSplit | null {
  const { odometer } = reconciliation
  if (!odometer || odometer.km <= 0 || fuelRon <= 0) return null
  const perKm = fuelRon / odometer.km
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    fuelRon: round2(fuelRon),
    perKm,
    business: round2(perKm * reconciliation.business),
    personal: round2(perKm * reconciliation.personal),
    unlogged: round2(perKm * Math.max(0, reconciliation.unlogged ?? 0)),
  }
}
