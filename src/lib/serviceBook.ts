/**
 * RL-047 (phase 5 slice 6 of #49): the digital service book.
 *
 * A **view** over the jobs that already exist — never a second place to
 * record work, because two ways to log a job means two histories that
 * disagree. A row is a completed job (`config.completeStatus`), with the
 * odometer reading written alongside it (`odometerKm` on the job form) and
 * its cost through `taskTotalCost()`, the same arithmetic as everywhere
 * else.
 *
 * ## Order, and saying so when it is not simple
 *
 * Rows go by date, then by km on the same day. The odometer history
 * already keeps readings in date order within a segment, so date order and
 * km order agree — except across a replaced cluster or a correction, where
 * the km legitimately starts again. That is marked on the row where it
 * happens instead of silently reordering the book around it. A km lower
 * than an earlier row with no override between them cannot be produced by
 * the routes today; if it ever appears it is flagged, not hidden.
 *
 * A job typed in long after it was done is normal and is shown as such —
 * "logged on …" — because a buyer reading a service book is entitled to
 * know which entries were written at the time.
 */

import { taskTotalCost, type CostTaskLike } from './analytics'

/** A job entered this long after its own date is shown as logged late. */
export const LATE_ENTRY_DAYS = 30
const DAY_MS = 86_400_000

export interface ServiceTaskLike extends CostTaskLike {
  id: string
  name: string
  status: string
  brand: string | null
  notes: string | null
  workshopName: string | null
  receiptUrl: string | null
  createdAt: Date
  photoCount: number
  /** The km written with this job, if any (OdometerReading source TASK). */
  km: number | null
}

export interface OverrideLike {
  readAt: Date
  overrideReason: string | null
}

export type RowFlag =
  | { kind: 'odometerReset'; reason: string | null }
  | { kind: 'kmBelowEarlier'; earlierKm: number }
  | { kind: 'loggedLate'; loggedOn: Date }

export interface ServiceRow {
  taskId: string
  date: Date
  km: number | null
  name: string
  category: string
  workType: 'DIY' | 'WORKSHOP'
  /** Parts as the owner wrote them (the job's brand field). */
  parts: string | null
  workshop: string | null
  notes: string | null
  cost: number
  receiptUrl: string | null
  photoCount: number
  flags: RowFlag[]
}

export interface ServiceBook {
  rows: ServiceRow[]
  total: number
  /** Rows with a km — the rest are placed by date alone. */
  withKm: number
}

export function serviceBook(
  tasks: ServiceTaskLike[],
  completeStatus: string,
  overrides: OverrideLike[] = []
): ServiceBook {
  const done = tasks
    .filter((t) => t.status === completeStatus)
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        (a.km ?? Number.MAX_SAFE_INTEGER) - (b.km ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    )

  const rows: ServiceRow[] = []
  let lastKm: number | null = null
  let lastDate: Date | null = null
  for (const task of done) {
    const flags: RowFlag[] = []

    // An override dated after the previous row and on or before this one
    // restarts the km, so the previous km no longer bounds this one.
    const reset = overrides.find((o) => (!lastDate || o.readAt > lastDate) && o.readAt <= task.date)
    if (reset && lastDate) {
      flags.push({ kind: 'odometerReset', reason: reset.overrideReason })
      lastKm = null
    }
    if (task.km !== null && lastKm !== null && task.km < lastKm) {
      flags.push({ kind: 'kmBelowEarlier', earlierKm: lastKm })
    }
    if (task.createdAt.getTime() - task.date.getTime() > LATE_ENTRY_DAYS * DAY_MS) {
      flags.push({ kind: 'loggedLate', loggedOn: task.createdAt })
    }

    rows.push({
      taskId: task.id,
      date: task.date,
      km: task.km,
      name: task.name,
      category: task.category,
      workType: task.workType,
      parts: task.brand,
      workshop: task.workType === 'WORKSHOP' ? task.workshopName : null,
      notes: task.notes,
      cost: taskTotalCost(task),
      receiptUrl: task.receiptUrl,
      photoCount: task.photoCount,
      flags,
    })
    if (task.km !== null) lastKm = Math.max(lastKm ?? 0, task.km)
    lastDate = task.date
  }

  return {
    rows,
    total: Math.round(rows.reduce((s, r) => s + r.cost, 0) * 100) / 100,
    withKm: rows.filter((r) => r.km !== null).length,
  }
}
