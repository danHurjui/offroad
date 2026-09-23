/**
 * RL-044, slice 2 of #49: odometer history.
 *
 * Pure, so the three rules the ticket calls load-bearing are tested
 * without a database:
 *
 * 1. **The current mileage is derived, never stored.** `currentReading()`
 *    is the newest reading; nothing on `Vehicle` caches it.
 * 2. **Readings stay in date order.** A reading must be at least the km of
 *    every earlier-dated reading and at most the km of every later-dated
 *    one. "Only goes up" by *date*, not by when it was typed: somebody
 *    entering last year's ITP mileage today is adding history, not making
 *    a mistake.
 * 3. **The exceptions are recorded as exceptions.** A replaced instrument
 *    cluster or a correction is accepted with `isOverride` and a reason.
 *    An override starts a new segment — bounds are never checked across
 *    one, so a cluster swapped at 212,000 km that now reads 0 does not
 *    make every later reading "too low".
 *
 * Readings on the same day never bound each other: two readings on one
 * day are a morning and an evening, and their order is not recoverable
 * from a date.
 */

export const ODOMETER_SOURCES = ['MANUAL', 'TASK', 'FOUND_STATE'] as const
export type OdometerSource = (typeof ODOMETER_SOURCES)[number]

export const OVERRIDE_REASONS = ['CLUSTER_REPLACED', 'CORRECTION'] as const
export type OverrideReason = (typeof OVERRIDE_REASONS)[number]

/** A million-kilometre truck exists; a ten-million one is a typo. */
export const MAX_KM = 3_000_000
export const NOTE_MAX_LENGTH = 200

export interface ReadingLike {
  id: string
  km: number
  readAt: Date
  isOverride: boolean
  createdAt?: Date
}

export type ReadingCheck =
  | { ok: true }
  | { ok: false; kind: 'belowEarlier' | 'aboveLater'; conflict: ReadingLike }

export function isOverrideReason(value: unknown): value is OverrideReason {
  return typeof value === 'string' && (OVERRIDE_REASONS as readonly string[]).includes(value)
}

/** The calendar day a reading belongs to, as a sortable key. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Midnight UTC of the given day — how every readAt is stored. */
export function startOfDayUtc(date: Date): Date {
  return new Date(`${dayKey(date)}T00:00:00.000Z`)
}

function chronological(a: ReadingLike, b: ReadingLike): number {
  const byDay = dayKey(a.readAt).localeCompare(dayKey(b.readAt))
  if (byDay !== 0) return byDay
  return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
}

/** The newest reading: latest day, and the last one entered on that day. */
export function currentReading<T extends ReadingLike>(readings: T[]): T | null {
  if (readings.length === 0) return null
  return [...readings].sort(chronological)[readings.length - 1]
}

/**
 * Whether a new (or edited) reading fits the history. `excludeId` leaves
 * out the reading being edited, so it is not compared with itself.
 */
export function checkReading(
  readings: ReadingLike[],
  candidate: { km: number; readAt: Date; isOverride: boolean },
  excludeId?: string
): ReadingCheck {
  if (candidate.isOverride) return { ok: true }

  const day = dayKey(candidate.readAt)
  const others = readings.filter((r) => r.id !== excludeId).sort(chronological)
  const earlier = others.filter((r) => dayKey(r.readAt) < day)
  const later = others.filter((r) => dayKey(r.readAt) > day)

  // Earlier readings in this segment: from the last override (inclusive)
  // before the candidate's day.
  let segmentStart = 0
  earlier.forEach((r, i) => {
    if (r.isOverride) segmentStart = i
  })
  const lowerSet = earlier.slice(segmentStart)
  const below = lowerSet.reduce<ReadingLike | null>((max, r) => (!max || r.km > max.km ? r : max), null)
  if (below && candidate.km < below.km) return { ok: false, kind: 'belowEarlier', conflict: below }

  // Later readings in this segment: up to (not including) the next override.
  const nextOverride = later.findIndex((r) => r.isOverride)
  const upperSet = nextOverride === -1 ? later : later.slice(0, nextOverride)
  const above = upperSet.reduce<ReadingLike | null>((min, r) => (!min || r.km < min.km ? r : min), null)
  if (above && candidate.km > above.km) return { ok: false, kind: 'aboveLater', conflict: above }

  return { ok: true }
}

export type KmParse = { ok: true; km: number | null } | { ok: false }

/** A km value from a form: blank is "none", otherwise a whole number in range. */
export function parseKm(value: unknown): KmParse {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, km: null }
  }
  const km = Number(value)
  if (!Number.isInteger(km) || km < 0 || km > MAX_KM) return { ok: false }
  return { ok: true, km }
}

/**
 * Kilometres covered across the whole history, summed per segment so a
 * cluster swap does not register as a quarter of a million negative km.
 * Used by the history page now, and by cost per km (slice 5) later.
 */
export function distanceCovered(readings: ReadingLike[]): number {
  const sorted = [...readings].sort(chronological)
  let total = 0
  let segmentFirst: ReadingLike | null = null
  let segmentLast: ReadingLike | null = null
  for (const r of sorted) {
    if (r.isOverride || !segmentFirst) {
      if (segmentFirst && segmentLast) total += Math.max(0, segmentLast.km - segmentFirst.km)
      segmentFirst = r
    }
    segmentLast = r
  }
  if (segmentFirst && segmentLast) total += Math.max(0, segmentLast.km - segmentFirst.km)
  return total
}
