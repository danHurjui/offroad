import { PROJECT_TYPE_CONFIG, type ProjectType } from './projectType'

/**
 * The two date rules the task form enforces, as plain functions so they can
 * be tested without a React tree — the same reason `decideReminder()` lives
 * apart from the reminder route.
 */

/**
 * Today in the *viewer's own* calendar, as `YYYY-MM-DD`.
 *
 * Not `toISOString().slice(0, 10)`, which is UTC: at 01:00 on the 18th in
 * Romania (UTC+3) that returns the 17th, so the form would default to
 * yesterday and a job finished today would be read as finished in the
 * future and refused. The comparison below is a string compare, which is
 * only correct while both sides are the same kind of date.
 */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Whether a task in this status may be dated in the future.
 *
 * A task is the unit of work *done* and work *intended*: every mode ships
 * forward-looking statuses — off-road `PLANNED`, daily-driver `DUE` and
 * `BOOKED` — and a service booked for next Tuesday has to be able to carry
 * next Tuesday's date. Only the mode's own complete status is barred, where
 * a future date is always a typo; the config owns which status that is, so
 * this never names one.
 */
export function allowsFutureDate(projectType: ProjectType, status: string): boolean {
  return status !== PROJECT_TYPE_CONFIG[projectType].completeStatus
}

/**
 * Whether `date` is after `today`, both `YYYY-MM-DD`.
 *
 * A lexicographic compare, which is exactly right for zero-padded ISO dates
 * and avoids `new Date('2026-10-01')` parsing as midnight UTC and landing
 * on the previous day for anyone west of it.
 */
export function isFutureDate(date: string, today: string = localIsoDate()): boolean {
  return date > today
}
