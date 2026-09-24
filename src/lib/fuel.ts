/**
 * RL-044, slice 3 of #49: the fuel log.
 *
 * ## Consumption is only computed between two full tanks
 *
 * Filling to the brim at A and again at B means everything put in after A,
 * up to and including B, is what the engine burnt over the distance A→B.
 * Partial fills in between still count — their litres are part of that
 * sum — but a partial fill can never *end* an interval, because the tank
 * was not back to the same level. A partial-fill figure is simply wrong,
 * and a wrong l/100km gets quoted; so an interval that cannot be measured
 * produces nothing, never an estimate.
 *
 * An interval is also dropped when either end has no km, when the km did
 * not go up, or when an odometer override (a replaced gauge) falls inside
 * it — the distance across that is unknowable from the readings.
 *
 * The average is total litres over total distance of the measured
 * intervals, not the mean of their ratios: a 40 km hop would otherwise
 * weigh as much as a 900 km run.
 */

export const LITRES_MAX = 2000
export const TOTAL_RON_MAX = 100_000
export const STATION_MAX_LENGTH = 80

export interface FuelLike {
  id: string
  date: Date
  litres: number
  totalRon: number
  isFullTank: boolean
  /** The odometer at the pump, when it was recorded. */
  km: number | null
  createdAt?: Date
}

export interface Interval {
  /** The full-tank entry that closes the interval. */
  endId: string
  startId: string
  litres: number
  km: number
  litresPer100Km: number
}

function chronological(a: FuelLike, b: FuelLike): number {
  const byDay = a.date.getTime() - b.date.getTime()
  if (byDay !== 0) return byDay
  // Same day: the km orders them if both have one, then entry order.
  if (a.km !== null && b.km !== null && a.km !== b.km) return a.km - b.km
  return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
}

/**
 * Every measurable full-to-full interval, oldest first.
 * `overrideDays` are the ISO days of odometer overrides for the vehicle.
 */
export function consumptionIntervals(entries: FuelLike[], overrideDays: string[] = []): Interval[] {
  const sorted = [...entries].sort(chronological)
  const intervals: Interval[] = []
  let start: FuelLike | null = null
  let litresSince = 0

  for (const entry of sorted) {
    if (!start) {
      // Nothing before the first full tank can be measured.
      if (entry.isFullTank) {
        start = entry
        litresSince = 0
      }
      continue
    }
    litresSince += entry.litres
    if (!entry.isFullTank) continue

    const from = start
    const startDay = from.date.toISOString().slice(0, 10)
    const endDay = entry.date.toISOString().slice(0, 10)
    const crossesOverride = overrideDays.some((d) => d > startDay && d <= endDay)
    if (from.km !== null && entry.km !== null && entry.km > from.km && !crossesOverride) {
      const km = entry.km - from.km
      intervals.push({
        startId: from.id,
        endId: entry.id,
        litres: round2(litresSince),
        km,
        litresPer100Km: round2((litresSince / km) * 100),
      })
    }
    // Every full tank is a fresh starting line, measurable or not.
    start = entry
    litresSince = 0
  }
  return intervals
}

export interface FuelSummary {
  averageLitresPer100Km: number | null
  lastLitresPer100Km: number | null
  measuredKm: number
  totalLitres: number
  totalRon: number
  fills: number
}

export function fuelSummary(entries: FuelLike[], overrideDays: string[] = []): FuelSummary {
  const intervals = consumptionIntervals(entries, overrideDays)
  const measuredKm = intervals.reduce((sum, i) => sum + i.km, 0)
  const measuredLitres = intervals.reduce((sum, i) => sum + i.litres, 0)
  return {
    averageLitresPer100Km: measuredKm > 0 ? round2((measuredLitres / measuredKm) * 100) : null,
    lastLitresPer100Km: intervals.length ? intervals[intervals.length - 1].litresPer100Km : null,
    measuredKm,
    totalLitres: round2(entries.reduce((sum, e) => sum + e.litres, 0)),
    totalRon: round2(entries.reduce((sum, e) => sum + e.totalRon, 0)),
    fills: entries.length,
  }
}

/** Derived, never stored — so litres, total and price can't disagree. */
export function pricePerLitre(litres: number, totalRon: number): number | null {
  return litres > 0 ? Math.round((totalRon / litres) * 1000) / 1000 : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type AmountParse = { ok: true; value: number } | { ok: false }

/** A positive decimal up to `max`, accepting a Romanian decimal comma. */
export function parsePositiveAmount(value: unknown, max: number): AmountParse {
  if (value === undefined || value === null) return { ok: false }
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > max) return { ok: false }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/**
 * Zero or a positive decimal up to `max` — for a charge, where free
 * charging (a supermarket car park, the office) is common and real.
 */
export function parseNonNegativeAmount(value: unknown, max: number): AmountParse {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return { ok: false }
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > max) return { ok: false }
  return { ok: true, value: Math.round(n * 100) / 100 }
}
