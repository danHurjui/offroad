/**
 * RL-056 (#124): the high-voltage battery's state of health, as it was
 * recorded, and its warranty.
 *
 * - **Recorded, never rated.** A reading is the figure a workshop test, the
 *   car's own display or the owner's tool gave, with where it came from.
 *   There is no agreed "bad" state of health, so nothing here turns one
 *   into a verdict — Car Health shows it as information, never as fine or
 *   worrying.
 * - **The km is not an OdometerReading**, for the reason an accident's is
 *   not: a report is often entered later than the test, and a guessed date
 *   must not bound the mileage history.
 * - **The warranty is the owner's figures**, never a default: the terms
 *   vary by car and by market. Whichever of the date and the km comes first
 *   ends it.
 */

export const BATTERY_SOURCES = ['WORKSHOP_TEST', 'CAR_DISPLAY', 'OWNER_TOOL'] as const
export type BatterySource = (typeof BATTERY_SOURCES)[number]

export const BATTERY_NOTE_MAX_LENGTH = 500
/** A car's whole life fits well inside this; more is a typo. */
export const BATTERY_KM_MAX = 2_000_000
export const WARRANTY_KM_MAX = 2_000_000

export function isBatterySource(value: unknown): value is BatterySource {
  return typeof value === 'string' && (BATTERY_SOURCES as readonly string[]).includes(value)
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

export interface BatteryReadingInput {
  sohPercent: number
  km: number | null
  source: BatterySource
  note: string | null
}

export type BatteryErrorCode = 'batterySohInvalid' | 'batteryKmInvalid' | 'batterySourceInvalid'

export type BatteryReadingParse = { ok: true; value: BatteryReadingInput } | { ok: false; code: BatteryErrorCode }

/** Everything in a reading except its date. */
export function parseBatteryReadingInput(body: Record<string, unknown>): BatteryReadingParse {
  const soh = typeof body.sohPercent === 'number' ? body.sohPercent : Number(String(body.sohPercent ?? '').trim())
  if (blank(body.sohPercent) || !Number.isInteger(soh) || soh < 1 || soh > 100) return { ok: false, code: 'batterySohInvalid' }

  let km: number | null = null
  if (!blank(body.km)) {
    const n = typeof body.km === 'number' ? body.km : Number(String(body.km).trim())
    if (!Number.isInteger(n) || n < 0 || n > BATTERY_KM_MAX) return { ok: false, code: 'batteryKmInvalid' }
    km = n
  }

  const source = body.source === undefined ? 'WORKSHOP_TEST' : body.source
  if (!isBatterySource(source)) return { ok: false, code: 'batterySourceInvalid' }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, BATTERY_NOTE_MAX_LENGTH) || null : null
  return { ok: true, value: { sohPercent: soh, km, source, note } }
}

export interface WarrantyInput {
  batteryWarrantyUntil: Date | null
  batteryWarrantyKm: number | null
}

export type WarrantyParse = { ok: true; value: WarrantyInput } | { ok: false; field: 'batteryWarrantyUntil' | 'batteryWarrantyKm' }

/** Both fields, each optional; blank clears one. A date is a whole day, UTC. */
export function parseWarranty(body: Record<string, unknown>): WarrantyParse {
  let until: Date | null = null
  if (!blank(body.batteryWarrantyUntil)) {
    const raw = String(body.batteryWarrantyUntil).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, field: 'batteryWarrantyUntil' }
    until = new Date(`${raw}T00:00:00Z`)
    if (Number.isNaN(until.getTime()) || until.toISOString().slice(0, 10) !== raw) return { ok: false, field: 'batteryWarrantyUntil' }
  }
  let km: number | null = null
  if (!blank(body.batteryWarrantyKm)) {
    const n = typeof body.batteryWarrantyKm === 'number' ? body.batteryWarrantyKm : Number(String(body.batteryWarrantyKm).trim())
    if (!Number.isInteger(n) || n < 1 || n > WARRANTY_KM_MAX) return { ok: false, field: 'batteryWarrantyKm' }
    km = n
  }
  return { ok: true, value: { batteryWarrantyUntil: until, batteryWarrantyKm: km } }
}

export interface BatteryReadingLike {
  date: Date
  sohPercent: number
  source: string
  createdAt?: Date
}

/** Oldest first: by the day of the test, then the order they were entered. */
export function sortReadings<T extends BatteryReadingLike>(readings: T[]): T[] {
  return [...readings].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  )
}
