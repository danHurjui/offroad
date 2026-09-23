import { parseKm, startOfDayUtc } from './odometer'
import { parseAmountRon, parsePastDay } from './ownershipCosts'

/**
 * RL-050 accidents and damage (slice 8 of #49): parsing a record from a
 * request, and the vocabulary its form and the passport share.
 *
 * A record says what the owner says happened. Having none says nothing
 * about the vehicle, only about what was recorded, and the passport words
 * it that way (`passport.absence.noAccidentsRecorded`).
 */

export const ACCIDENT_KINDS = ['COLLISION', 'PARKING', 'WEATHER', 'VANDALISM', 'THEFT', 'OTHER'] as const
export type AccidentKind = (typeof ACCIDENT_KINDS)[number]

/** Whose insurance paid: none, the other driver's RCA, or the owner's CASCO. */
export const INSURANCE_ROUTES = ['NONE', 'RCA', 'CASCO'] as const
export type InsuranceRoute = (typeof INSURANCE_ROUTES)[number]

export const DESCRIPTION_MAX = 1000
/** Photos per record, whatever the plan: damage needs a few angles, not an album. */
export const ACCIDENT_PHOTO_LIMIT = 6
/** Photos only — a PDF claim file belongs with the documents. */
export const ACCIDENT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/heic']

export function isAccidentKind(value: unknown): value is AccidentKind {
  return typeof value === 'string' && (ACCIDENT_KINDS as readonly string[]).includes(value)
}

export function isInsuranceRoute(value: unknown): value is InsuranceRoute {
  return typeof value === 'string' && (INSURANCE_ROUTES as readonly string[]).includes(value)
}

export type AccidentField = 'date' | 'kind' | 'description' | 'km' | 'insurance' | 'repairCostRon' | 'repairedAt'

export type AccidentData = Partial<{
  date: Date
  kind: AccidentKind
  description: string
  km: number | null
  insurance: InsuranceRoute | null
  repairCostRon: number | null
  repairedAt: Date | null
}>

export type AccidentParse = { ok: true; data: AccidentData } | { ok: false; field: AccidentField }

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/**
 * On create the date, kind and description are required; on edit only the
 * fields sent are returned. A repair cannot predate the damage it repaired
 * (`existing` carries the stored dates on an edit so either side can move).
 */
export function parseAccident(
  body: Record<string, unknown>,
  { create, existing }: { create: boolean; existing?: { date: Date; repairedAt: Date | null } },
  now: Date = new Date()
): AccidentParse {
  const data: AccidentData = {}

  if (body.date !== undefined || create) {
    const d = blank(body.date) ? false : parsePastDay(body.date, now)
    if (!d) return { ok: false, field: 'date' }
    data.date = d
  }
  if (body.kind !== undefined || create) {
    if (!isAccidentKind(body.kind)) return { ok: false, field: 'kind' }
    data.kind = body.kind
  }
  if (body.description !== undefined || create) {
    if (typeof body.description !== 'string') return { ok: false, field: 'description' }
    const text = body.description.trim()
    if (text.length === 0 || text.length > DESCRIPTION_MAX) return { ok: false, field: 'description' }
    data.description = text
  }
  if (body.km !== undefined) {
    const km = parseKm(body.km)
    if (!km.ok) return { ok: false, field: 'km' }
    data.km = km.km
  }
  if (body.insurance !== undefined) {
    if (blank(body.insurance)) data.insurance = null
    else if (isInsuranceRoute(body.insurance)) data.insurance = body.insurance
    else return { ok: false, field: 'insurance' }
  }
  if (body.repairCostRon !== undefined) {
    const n = parseAmountRon(body.repairCostRon)
    if (n === false) return { ok: false, field: 'repairCostRon' }
    data.repairCostRon = n
  }
  if (body.repairedAt !== undefined) {
    const d = parsePastDay(body.repairedAt, now)
    if (d === false) return { ok: false, field: 'repairedAt' }
    data.repairedAt = d
  }

  const date = data.date ?? existing?.date
  const repairedAt = data.repairedAt !== undefined ? data.repairedAt : existing?.repairedAt ?? null
  if (date && repairedAt && startOfDayUtc(repairedAt) < startOfDayUtc(date)) return { ok: false, field: 'repairedAt' }

  return { ok: true, data }
}
