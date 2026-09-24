/**
 * RL-050, slice 1 of #49: what identifies a vehicle on the road.
 *
 * The licence plate and the registration details from the talon. All of
 * it is optional — a barn-find restoration has no plate, and a profile
 * that nags for one is a profile people abandon.
 *
 * ## The plate is identifying
 *
 * Like the VIN (RL-028 shows decoded spec publicly, never the raw VIN),
 * the plate is **never rendered on a public surface** — the build page,
 * the community feed, the share cards, the sitemap. `vehicleProfile.test.ts`
 * reads those files to hold that line. It is visible to the owner and to
 * the owner's collaborators, who can already see everything else about
 * the vehicle.
 *
 * ## Values, not labels
 *
 * `fuelType` and `transmission` are stored as these codes and labelled
 * from the catalogue (`vehicleProfile.fuel.*`, `vehicleProfile.gearbox.*`), the same split the
 * project-type vocabulary uses: a validator must never depend on the
 * request's language.
 */

export const FUEL_TYPES = ['PETROL', 'DIESEL', 'LPG', 'HYBRID', 'PLUGIN_HYBRID', 'ELECTRIC', 'OTHER'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'] as const
export type Transmission = (typeof TRANSMISSIONS)[number]

/**
 * RL-052: the sockets a car that plugs in can take. Codes, labelled from
 * `vehicleProfile.connector.*`, like the fuel types.
 */
export const CONNECTOR_TYPES = ['TYPE_2', 'CCS2', 'CHADEMO', 'TYPE_1', 'SCHUKO', 'OTHER'] as const
export type ConnectorType = (typeof CONNECTOR_TYPES)[number]

export const PLATE_MAX_LENGTH = 12
export const COLOUR_MAX_LENGTH = 40

/** Bounds wide enough for a moped and a coach, narrow enough to catch a typo'd extra digit. */
export const RANGES = {
  engineCapacityCc: { min: 49, max: 20000 },
  powerKw: { min: 1, max: 1500 },
  seats: { min: 1, max: 90 },
  // RL-052. Usable capacity: a small plug-in hybrid has ~5 kWh, the
  // largest electric pickups ~200.
  batteryCapacityKwh: { min: 1, max: 250 },
  maxAcKw: { min: 1, max: 50 },
  maxDcKw: { min: 1, max: 1000 },
} as const

export function isFuelType(value: unknown): value is FuelType {
  return typeof value === 'string' && (FUEL_TYPES as readonly string[]).includes(value)
}

export function isConnectorType(value: unknown): value is ConnectorType {
  return typeof value === 'string' && (CONNECTOR_TYPES as readonly string[]).includes(value)
}

export function isTransmission(value: unknown): value is Transmission {
  return typeof value === 'string' && (TRANSMISSIONS as readonly string[]).includes(value)
}

/**
 * The plate as it is stored and shown: upper case, single spaces, trimmed.
 *
 * Deliberately **not** checked against the Romanian format. Temporary
 * plates (`B 012345`), foreign plates on a vehicle being imported, and
 * historic `ROU` plates are all real, and refusing a plate that exists
 * because a regex did not expect it is worse than accepting a typo the
 * owner can see. Only the character set and length are enforced.
 *
 * Returns null for "no plate", and `false` for something that cannot be one.
 */
export function normalizePlate(input: unknown): string | null | false {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') return false
  const plate = input.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!plate) return null
  if (plate.length > PLATE_MAX_LENGTH) return false
  if (!/^[A-Z0-9][A-Z0-9 -]*$/.test(plate)) return false
  return plate
}

/**
 * What a plate search compares: letters and digits only, so `B123ABC`,
 * `b 123 abc` and `B-123-ABC` all find the same vehicle.
 */
export function plateSearchKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type ProfileField =
  | 'plate'
  | 'firstRegistrationDate'
  | 'fuelType'
  | 'transmission'
  | 'engineCapacityCc'
  | 'powerKw'
  | 'colour'
  | 'seats'
  | 'batteryCapacityKwh'
  | 'connectorTypes'
  | 'maxAcKw'
  | 'maxDcKw'

export const PROFILE_FIELDS: readonly ProfileField[] = [
  'plate',
  'firstRegistrationDate',
  'fuelType',
  'transmission',
  'engineCapacityCc',
  'powerKw',
  'colour',
  'seats',
  'batteryCapacityKwh',
  'connectorTypes',
  'maxAcKw',
  'maxDcKw',
]

export type ProfileData = Partial<{
  plate: string | null
  firstRegistrationDate: Date | null
  fuelType: FuelType | null
  transmission: Transmission | null
  engineCapacityCc: number | null
  powerKw: number | null
  colour: string | null
  seats: number | null
  batteryCapacityKwh: number | null
  connectorTypes: ConnectorType[]
  maxAcKw: number | null
  maxDcKw: number | null
}>

export type ProfileParse = { ok: true; data: ProfileData } | { ok: false; field: ProfileField }

/** Empty string and null both mean "cleared"; undefined means "not sent". */
function blank(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

function intInRange(value: unknown, range: { min: number; max: number }): number | null | false {
  if (blank(value)) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < range.min || n > range.max) return false
  return n
}

/**
 * Reads the profile fields out of a request body. Only fields actually
 * present are returned, so a PATCH that sends one field changes one field.
 * The first invalid field is named, for the error message.
 */
export function parseProfile(body: Record<string, unknown>, now: Date = new Date()): ProfileParse {
  const data: ProfileData = {}

  if (body.plate !== undefined) {
    const plate = normalizePlate(body.plate)
    if (plate === false) return { ok: false, field: 'plate' }
    data.plate = plate
  }

  if (body.firstRegistrationDate !== undefined) {
    if (blank(body.firstRegistrationDate)) {
      data.firstRegistrationDate = null
    } else {
      const date = new Date(String(body.firstRegistrationDate))
      // Not before the first car, not after today.
      if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1886 || date.getTime() > now.getTime()) {
        return { ok: false, field: 'firstRegistrationDate' }
      }
      data.firstRegistrationDate = date
    }
  }

  if (body.fuelType !== undefined) {
    if (blank(body.fuelType)) data.fuelType = null
    else if (isFuelType(body.fuelType)) data.fuelType = body.fuelType
    else return { ok: false, field: 'fuelType' }
  }

  if (body.transmission !== undefined) {
    if (blank(body.transmission)) data.transmission = null
    else if (isTransmission(body.transmission)) data.transmission = body.transmission
    else return { ok: false, field: 'transmission' }
  }

  for (const field of ['engineCapacityCc', 'powerKw', 'seats'] as const) {
    if (body[field] === undefined) continue
    const n = intInRange(body[field], RANGES[field])
    if (n === false) return { ok: false, field }
    data[field] = n
  }

  // RL-052: the battery side. Kept whatever the fuel type says — switching
  // a vehicle to petrol by mistake must not throw away what was entered;
  // the form only hides these while they do not apply.
  if (body.batteryCapacityKwh !== undefined) {
    if (blank(body.batteryCapacityKwh)) data.batteryCapacityKwh = null
    else {
      const n = Number(body.batteryCapacityKwh)
      const { min, max } = RANGES.batteryCapacityKwh
      // One decimal is what a spec sheet quotes (e.g. 52.0, 77.4).
      if (!Number.isFinite(n) || n < min || n > max || Math.round(n * 10) !== n * 10) {
        return { ok: false, field: 'batteryCapacityKwh' }
      }
      data.batteryCapacityKwh = n
    }
  }

  for (const field of ['maxAcKw', 'maxDcKw'] as const) {
    if (body[field] === undefined) continue
    const n = intInRange(body[field], RANGES[field])
    if (n === false) return { ok: false, field }
    data[field] = n
  }

  if (body.connectorTypes !== undefined) {
    if (body.connectorTypes === null) data.connectorTypes = []
    else if (!Array.isArray(body.connectorTypes) || !body.connectorTypes.every(isConnectorType)) {
      return { ok: false, field: 'connectorTypes' }
    } else {
      // Stored in catalogue order, once each, so two saves of the same
      // choice are the same row.
      const chosen = new Set<string>(body.connectorTypes)
      data.connectorTypes = CONNECTOR_TYPES.filter((c) => chosen.has(c))
    }
  }

  if (body.colour !== undefined) {
    if (blank(body.colour)) data.colour = null
    else if (typeof body.colour !== 'string' || body.colour.trim().length > COLOUR_MAX_LENGTH) {
      return { ok: false, field: 'colour' }
    } else data.colour = body.colour.trim()
  }

  return { ok: true, data }
}

/** Kilowatts to the horsepower (CP) Romanian listings quote, rounded. */
export function kwToCp(kw: number): number {
  return Math.round(kw * 1.35962)
}

/**
 * The garage search: a plate matches ignoring spaces and dashes, anything
 * else matches make, model, generation or year as typed. In memory — a
 * garage is a handful of vehicles, and the fleet screens (RL-039) are
 * where a database-side search will earn its keep.
 */
export function matchesVehicleSearch(
  vehicle: { plate: string | null; make: string; model: string; year: number; generation: string | null },
  query: string
): boolean {
  const q = query.trim()
  if (!q) return true
  const key = plateSearchKey(q)
  if (key && vehicle.plate && plateSearchKey(vehicle.plate).includes(key)) return true
  const text = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.generation ?? ''}`.toLowerCase()
  return text.includes(q.toLowerCase())
}
