/**
 * RL-053 (#121): the charging log, for a vehicle that plugs in
 * (`takesCharge()`). It mirrors the fuel log (`fuel.ts`) and differs from
 * it in three places, each on purpose:
 *
 * - **The total may be 0.** Free charging — a supermarket car park, the
 *   office — is common and real, and refusing it would make the log lie
 *   by omission. `parseNonNegativeAmount()`, not `parsePositiveAmount()`.
 * - **kWh may be missing.** Most charging happens at home, often on a
 *   socket with no meter. An entry with a total and no kWh still counts
 *   towards cost; it can never count towards consumption (RL-054).
 * - **A home charge can be entered as kWh alone**, when the owner has set
 *   a home tariff. The total is then *worked out* from that tariff, stored
 *   with `totalFromTariff` and labelled that way — it is never shown as a
 *   price somebody paid, and a later tariff change rewrites nothing.
 *
 * kWh is never guessed from battery % × capacity: that is the car's own
 * estimate, not a measurement. The battery % before and after is recorded
 * as given, for RL-054's same-level intervals.
 */

import { parseNonNegativeAmount, parsePositiveAmount, TOTAL_RON_MAX } from './fuel'

export const CHARGE_LOCATIONS = ['HOME', 'WORK', 'PUBLIC_AC', 'PUBLIC_DC', 'OTHER'] as const
export type ChargeLocation = (typeof CHARGE_LOCATIONS)[number]

/** A lorry's battery is a few hundred kWh; one charge above this is a typo. */
export const KWH_MAX = 1000
export const NETWORK_MAX_LENGTH = 80
/** RON per kWh. Household electricity is around 1; ten is a typo. */
export const TARIFF_MAX = 10

export function isChargeLocation(value: unknown): value is ChargeLocation {
  return typeof value === 'string' && (CHARGE_LOCATIONS as readonly string[]).includes(value)
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

export type SocParse = { ok: true; value: number | null } | { ok: false }

/** A battery percentage, 0–100, whole numbers; blank is "not recorded". */
export function parseSoc(value: unknown): SocParse {
  if (blank(value)) return { ok: true, value: null }
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false }
  return { ok: true, value: n }
}

export type TariffParse = { ok: true; value: number | null } | { ok: false }

/** The owner's home tariff, RON per kWh to four places; blank clears it. */
export function parseTariff(value: unknown): TariffParse {
  if (blank(value)) return { ok: true, value: null }
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > TARIFF_MAX) return { ok: false }
  return { ok: true, value: Math.round(n * 10_000) / 10_000 }
}

export interface ChargeInput {
  kwh: number | null
  totalRon: number
  totalFromTariff: boolean
  location: ChargeLocation
  network: string | null
  socFrom: number | null
  socTo: number | null
}

export type ChargeParse = { ok: true; value: ChargeInput } | { ok: false; code: ChargeErrorCode }

export type ChargeErrorCode =
  | 'chargeLocationInvalid'
  | 'chargeKwhInvalid'
  | 'chargeTotalInvalid'
  | 'chargeTotalNeeded'
  | 'chargeSocInvalid'

/**
 * Everything in a charge except its date and km, which go through the
 * odometer's own parsing like a fill-up's. `homeTariff` is the vehicle's
 * `homeTariffRonPerKwh`, or null when none is set.
 */
export function parseChargeInput(body: Record<string, unknown>, homeTariff: number | null): ChargeParse {
  const location = body.location === undefined ? 'HOME' : body.location
  if (!isChargeLocation(location)) return { ok: false, code: 'chargeLocationInvalid' }

  let kwh: number | null = null
  if (!blank(body.kwh)) {
    const parsed = parsePositiveAmount(body.kwh, KWH_MAX)
    if (!parsed.ok) return { ok: false, code: 'chargeKwhInvalid' }
    kwh = parsed.value
  }

  let totalRon: number
  let totalFromTariff = false
  if (!blank(body.totalRon)) {
    const parsed = parseNonNegativeAmount(body.totalRon, TOTAL_RON_MAX)
    if (!parsed.ok) return { ok: false, code: 'chargeTotalInvalid' }
    totalRon = parsed.value
  } else if (location === 'HOME' && kwh !== null && homeTariff !== null) {
    totalRon = Math.round(kwh * homeTariff * 100) / 100
    totalFromTariff = true
  } else {
    // Without a total there is nothing to count. The tariff only ever
    // stands in for a home charge whose kWh is known.
    return { ok: false, code: 'chargeTotalNeeded' }
  }

  const socFrom = parseSoc(body.socFrom)
  const socTo = parseSoc(body.socTo)
  if (!socFrom.ok || !socTo.ok) return { ok: false, code: 'chargeSocInvalid' }
  if (socFrom.value !== null && socTo.value !== null && socFrom.value >= socTo.value) {
    return { ok: false, code: 'chargeSocInvalid' }
  }

  const network = typeof body.network === 'string' ? body.network.trim().slice(0, NETWORK_MAX_LENGTH) || null : null

  return { ok: true, value: { kwh, totalRon, totalFromTariff, location, network, socFrom: socFrom.value, socTo: socTo.value } }
}

/** Derived, never stored — so kWh, total and price can't disagree. */
export function pricePerKwh(kwh: number | null, totalRon: number): number | null {
  return kwh !== null && kwh > 0 ? Math.round((totalRon / kwh) * 1000) / 1000 : null
}

export interface ChargeLike {
  kwh: number | null
  totalRon: number
}

export interface ChargeSummary {
  charges: number
  totalRon: number
  /** Only the charges that recorded kWh. */
  totalKwh: number
  /** Charges with a total but no kWh: counted in cost, not in energy. */
  withoutKwh: number
  /**
   * Total RON over total kWh, from the charges that have both — weighted
   * by energy, not a mean of each charge's price.
   */
  averagePricePerKwh: number | null
}

export function chargeSummary(entries: ChargeLike[]): ChargeSummary {
  const metered = entries.filter((e) => e.kwh !== null && e.kwh > 0)
  const totalKwh = round2(metered.reduce((s, e) => s + (e.kwh ?? 0), 0))
  const meteredRon = metered.reduce((s, e) => s + e.totalRon, 0)
  return {
    charges: entries.length,
    totalRon: round2(entries.reduce((s, e) => s + e.totalRon, 0)),
    totalKwh,
    withoutKwh: entries.length - metered.length,
    averagePricePerKwh: totalKwh > 0 ? Math.round((meteredRon / totalKwh) * 1000) / 1000 : null,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
