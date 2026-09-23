import { getDocumentStatus, isHistoricVehicle, type DocumentStatus } from './documents'

/**
 * RL-039 fleet dashboard: the compliance board — every vehicle of an
 * organisation × every document a Romanian fleet is stopped at the roadside
 * for. Pure, fed by two queries (the vehicles, their documents), and every
 * day count comes from `getDocumentStatus()` — the function the documents
 * board, Car Health and the reminder cron use — so the board and the
 * emails cannot disagree about how many days are left.
 *
 * - **Nothing recorded is `none`, never fine.** A vehicle with no ITP on
 *   record is unknown, and the board says so (the Car Health rule).
 * - **Off the road today** is a vehicle with any of these already expired.
 * - **Historic status changes nothing.** It is a label (`isHistoricVehicle`,
 *   30+ years); the count comes from the expiry dates as entered, exactly
 *   as the reminders do.
 */

/** The columns, in the order a roadside check asks for them. The vignette is for travel abroad, so it is not here. */
export const FLEET_DOCUMENT_TYPES = ['ITP', 'RCA', 'CASCO', 'ROVINIETA', 'FIRST_AID_KIT', 'FIRE_EXTINGUISHER'] as const
export type FleetDocumentType = (typeof FLEET_DOCUMENT_TYPES)[number]

export interface FleetVehicle {
  id: string
  year: number
  make: string
  model: string
  plate: string | null
}

export interface FleetDocument {
  vehicleId: string
  type: string
  expiryDate: Date
}

export type FleetCell = { expiryDate: Date; daysUntil: number; status: DocumentStatus } | null

export interface FleetRow {
  vehicle: FleetVehicle
  historic: boolean
  cells: Record<FleetDocumentType, FleetCell>
  /** Expired types; non-empty means off the road today. */
  expired: FleetDocumentType[]
  /** Types with nothing on record. */
  missing: FleetDocumentType[]
  /** Days to the soonest recorded expiry (negative once past), or null with nothing recorded. */
  soonest: number | null
}

export interface FleetBoard {
  rows: FleetRow[]
  totals: { vehicles: number; offRoad: number; expiring: number; missingItpOrRca: number }
}

function isFleetType(type: string): type is FleetDocumentType {
  return (FLEET_DOCUMENT_TYPES as readonly string[]).includes(type)
}

/**
 * One row per vehicle, sorted so the worst is first: off the road, then by
 * the soonest expiry, then vehicles with nothing recorded at all (unknown,
 * so above the ones known to be fine would be wrong either way — they sit
 * last but are counted and marked).
 */
export function complianceBoard(vehicles: FleetVehicle[], documents: FleetDocument[], now: Date = new Date()): FleetBoard {
  // A document is renewed in place, but if two of a type exist the later
  // expiry is the one in force.
  const latest = new Map<string, FleetDocument>()
  for (const doc of documents) {
    if (!isFleetType(doc.type)) continue
    const key = `${doc.vehicleId}:${doc.type}`
    const seen = latest.get(key)
    if (!seen || doc.expiryDate > seen.expiryDate) latest.set(key, doc)
  }

  const rows: FleetRow[] = vehicles.map((vehicle) => {
    const cells = {} as Record<FleetDocumentType, FleetCell>
    const expired: FleetDocumentType[] = []
    const missing: FleetDocumentType[] = []
    let soonest: number | null = null
    for (const type of FLEET_DOCUMENT_TYPES) {
      const doc = latest.get(`${vehicle.id}:${type}`)
      if (!doc) {
        cells[type] = null
        missing.push(type)
        continue
      }
      const status = getDocumentStatus(doc.expiryDate, now)
      cells[type] = { expiryDate: doc.expiryDate, ...status }
      if (status.status === 'expired') expired.push(type)
      if (soonest === null || status.daysUntil < soonest) soonest = status.daysUntil
    }
    return { vehicle, historic: isHistoricVehicle(vehicle.year, now), cells, expired, missing, soonest }
  })

  rows.sort((a, b) => {
    const offRoad = Number(b.expired.length > 0) - Number(a.expired.length > 0)
    if (offRoad !== 0) return offRoad
    if (a.soonest === null || b.soonest === null) return a.soonest === null ? (b.soonest === null ? 0 : 1) : -1
    return a.soonest - b.soonest
  })

  return {
    rows,
    totals: {
      vehicles: rows.length,
      offRoad: rows.filter((r) => r.expired.length > 0).length,
      expiring: rows.filter((r) => r.expired.length === 0 && FLEET_DOCUMENT_TYPES.some((t) => r.cells[t]?.status === 'expiring')).length,
      missingItpOrRca: rows.filter((r) => r.missing.includes('ITP') || r.missing.includes('RCA')).length,
    },
  }
}
