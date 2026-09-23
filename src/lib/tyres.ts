import { parseKm, startOfDayUtc } from './odometer'
import { parseCostPaid } from './ownershipCosts'

/**
 * RL-050 tyres (slice 4 of #49): parsing a tyre set from a request.
 * Car Health (src/lib/vehicleHealth.ts) is what reads them.
 */

export const TYRE_SEASONS = ['SUMMER', 'WINTER', 'ALL_SEASON'] as const
export type TyreSeason = (typeof TYRE_SEASONS)[number]

export const TREAD_MAX_MM = 20
export const LABEL_MAX = 80
export const SIZE_MAX = 20
export const NOTES_MAX = 300

export function isTyreSeason(value: unknown): value is TyreSeason {
  return typeof value === 'string' && (TYRE_SEASONS as readonly string[]).includes(value)
}

export type TyreField = 'season' | 'label' | 'size' | 'dotYear' | 'fittedAt' | 'fittedKm' | 'treadDepthMm' | 'notes' | 'costRon' | 'purchasedAt'

export type TyreData = Partial<{
  season: TyreSeason
  label: string | null
  size: string | null
  dotYear: number | null
  isFitted: boolean
  fittedAt: Date | null
  fittedKm: number | null
  treadDepthMm: number | null
  treadMeasuredAt: Date | null
  notes: string | null
  costRon: number | null
  purchasedAt: Date | null
}>

export type TyreParse = { ok: true; data: TyreData } | { ok: false; field: TyreField }

const blank = (v: unknown) => v === null || (typeof v === 'string' && v.trim() === '')

function text(value: unknown, max: number): string | null | false {
  if (blank(value)) return null
  if (typeof value !== 'string' || value.trim().length > max) return false
  return value.trim()
}

/**
 * Only the fields sent are returned (a PATCH changes what it names).
 * Recording a tread depth stamps when it was measured — today, unless the
 * request says otherwise — because a depth without a date is a guess.
 */
export function parseTyreSet(
  body: Record<string, unknown>,
  { requireSeason, purchasedAt = null }: { requireSeason: boolean; purchasedAt?: Date | null },
  now = new Date()
): TyreParse {
  const data: TyreData = {}

  // RL-045: what the set cost, dated so the cost of ownership can place it.
  const cost = parseCostPaid(body, 'purchasedAt', purchasedAt, now)
  if (!cost.ok) return { ok: false, field: cost.field }
  Object.assign(data, cost.data)

  if (body.season !== undefined || requireSeason) {
    if (!isTyreSeason(body.season)) return { ok: false, field: 'season' }
    data.season = body.season
  }
  for (const [field, max] of [['label', LABEL_MAX], ['size', SIZE_MAX], ['notes', NOTES_MAX]] as const) {
    if (body[field] === undefined) continue
    const v = text(body[field], max)
    if (v === false) return { ok: false, field }
    data[field] = v
  }
  if (body.dotYear !== undefined) {
    if (blank(body.dotYear)) data.dotYear = null
    else {
      const y = Number(body.dotYear)
      if (!Number.isInteger(y) || y < 1970 || y > now.getUTCFullYear() + 1) return { ok: false, field: 'dotYear' }
      data.dotYear = y
    }
  }
  if (body.isFitted !== undefined) data.isFitted = Boolean(body.isFitted)
  if (body.fittedAt !== undefined) {
    if (blank(body.fittedAt)) data.fittedAt = null
    else {
      const d = new Date(String(body.fittedAt))
      if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime()) return { ok: false, field: 'fittedAt' }
      data.fittedAt = startOfDayUtc(d)
    }
  }
  if (body.fittedKm !== undefined) {
    const km = parseKm(body.fittedKm)
    if (!km.ok) return { ok: false, field: 'fittedKm' }
    data.fittedKm = km.km
  }
  if (body.treadDepthMm !== undefined) {
    if (blank(body.treadDepthMm)) {
      data.treadDepthMm = null
      data.treadMeasuredAt = null
    } else {
      const mm = Number(String(body.treadDepthMm).replace(',', '.'))
      if (!Number.isFinite(mm) || mm < 0 || mm > TREAD_MAX_MM) return { ok: false, field: 'treadDepthMm' }
      data.treadDepthMm = Math.round(mm * 10) / 10
      data.treadMeasuredAt = startOfDayUtc(now)
    }
  }
  return { ok: true, data }
}
