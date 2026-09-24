/**
 * RL-054 (#122): the one interval walk that the fuel log and the charging
 * log both measure consumption with, so their rules cannot drift apart.
 *
 * ## What an interval is
 *
 * Something brought the vehicle to a known **level** at A — a full tank,
 * or the battery charged to 80% — and something brought it back to **the
 * same level** at B. Then everything put in after A, up to and including
 * B, is what was used over the distance A→B. Nothing else is a
 * measurement: a figure between two different levels is a guess, and a
 * wrong l/100 km or kWh/100 km gets quoted.
 *
 * - An entry with no level (a partial fill, a charge with no battery %)
 *   adds its amount and never opens or closes anything.
 * - An entry at a *different* level from the open start also only adds
 *   its amount: a stop at 60% between two charges to 80% does not change
 *   what the second 80% measures. It is kept as a start of its own, so an
 *   owner who switches from 80% to 90% starts being measured again.
 * - An interval closes at the first entry back at the level of any open
 *   start. Every open start is then dropped and that entry is the only
 *   one, so measured intervals never overlap and the km are never counted
 *   twice in an average.
 * - An interval is dropped — and its end still becomes the new start —
 *   when either end has no km, the km did not go up, an odometer override
 *   (a replaced gauge) falls inside it, or **any entry inside it has no
 *   amount** (a charge with no kWh: the energy is then unknown).
 *
 * The average is the total amount over the total km of the measured
 * intervals, never the mean of their ratios: a 40 km hop would otherwise
 * weigh as much as a 900 km run.
 */

export interface Measurable {
  id: string
  date: Date
  /** The odometer when it happened, if recorded. */
  km: number | null
  createdAt?: Date
  /** Litres or kWh put in; null when not known. */
  amount: number | null
  /** The level it brought the vehicle to, when that is known and comparable. */
  level: string | number | null
}

export interface MeasuredInterval {
  startId: string
  endId: string
  /** Everything put in after the start, up to and including the end. */
  amount: number
  km: number
  per100Km: number
}

/** Oldest first: by day, then km on the same day, then entry order. */
export function chronological(a: Pick<Measurable, 'date' | 'km' | 'createdAt'>, b: Pick<Measurable, 'date' | 'km' | 'createdAt'>): number {
  const byDay = a.date.getTime() - b.date.getTime()
  if (byDay !== 0) return byDay
  if (a.km !== null && b.km !== null && a.km !== b.km) return a.km - b.km
  return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10)

export function crossesOverride(from: Date, to: Date, overrideDays: string[]): boolean {
  const startDay = dayOf(from)
  const endDay = dayOf(to)
  return overrideDays.some((d) => d > startDay && d <= endDay)
}

/** `overrideDays` are the ISO days of odometer overrides for the vehicle. */
export function measureIntervals(entries: Measurable[], overrideDays: string[] = []): MeasuredInterval[] {
  const sorted = [...entries].sort(chronological)
  const intervals: MeasuredInterval[] = []
  // Running totals, so an interval from any open start is a subtraction.
  let amountSoFar = 0
  let unknownSoFar = 0
  const open = new Map<string | number, { entry: Measurable; amount: number; unknown: number }>()

  for (const entry of sorted) {
    amountSoFar += entry.amount ?? 0
    if (entry.amount === null) unknownSoFar += 1
    if (entry.level === null) continue

    const start = open.get(entry.level)
    if (start) {
      const from = start.entry
      const unknownInside = unknownSoFar - start.unknown
      if (
        unknownInside === 0 &&
        from.km !== null &&
        entry.km !== null &&
        entry.km > from.km &&
        !crossesOverride(from.date, entry.date, overrideDays)
      ) {
        const amount = round2(amountSoFar - start.amount)
        const km = entry.km - from.km
        intervals.push({ startId: from.id, endId: entry.id, amount, km, per100Km: round2((amount / km) * 100) })
      }
      // Measurable or not, this is the one fresh starting line.
      open.clear()
    }
    open.set(entry.level, { entry, amount: amountSoFar, unknown: unknownSoFar })
  }
  return intervals
}

export interface ConsumptionSummary {
  averagePer100Km: number | null
  lastPer100Km: number | null
  measuredKm: number
  intervals: number
}

export function summarize(intervals: MeasuredInterval[]): ConsumptionSummary {
  const measuredKm = intervals.reduce((sum, i) => sum + i.km, 0)
  const measured = intervals.reduce((sum, i) => sum + i.amount, 0)
  return {
    averagePer100Km: measuredKm > 0 ? round2((measured / measuredKm) * 100) : null,
    lastPer100Km: intervals.length ? intervals[intervals.length - 1].per100Km : null,
    measuredKm,
    intervals: intervals.length,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
