/**
 * RL-028: VIN / chassis decoder, restoration mode.
 *
 * Two decode paths, per the ticket:
 * - "local" — a small WMI (World Manufacturer Identifier) table for
 *   Dacia/Renault-Romania, whose real-world codes (UU1/UU2/UU6, Mioveni
 *   plant) are well documented. Standard-VIN decoding (WMI + the
 *   position-10 model-year code) is universal per ISO 3779, so this
 *   covers any Dacia built after it adopted standard 17-char VINs.
 * - "nhtsa" — NHTSA's free vPIC API, for everything else.
 *
 * What this deliberately does NOT do: fabricate an ARO / pre-standard
 * Romanian chassis-number lookup table. A web search for one during
 * implementation turned up no verifiable reference data (ARO predates
 * ISO 3779 VIN adoption for much of its production run, and chassis
 * numbering wasn't standardized) — inventing factory codes would be
 * worse than not decoding at all. Those vehicles fall through to the
 * manual-entry fallback the ticket already requires for any
 * undecodable VIN.
 *
 * It also never invents a colour code: there's no international
 * standard encoding paint colour in a VIN (it's manufacturer/model-
 * specific, usually on a separate data plate), so colorCode is always
 * left for the user to fill in via the manual-entry fields, on both the
 * "local" and "nhtsa" paths.
 */

export interface DecodedVin {
  manufacturer: string | null
  modelYear: number | null
  factory: string | null
  engineCode: string | null
  bodyStyle: string | null
  colorCode: string | null
}

export type VinDecodeSource = 'local' | 'nhtsa' | 'manual'

// ISO 3779: 17 chars, excludes I/O/Q (too easily confused with 1/0).
const VIN_FORMAT = /^[A-HJ-NPR-Z0-9]{17}$/

export function isValidVinFormat(vin: string): boolean {
  return VIN_FORMAT.test(vin.trim().toUpperCase())
}

// Position 10 model-year code — universal across ISO 3779 VINs, but the
// letter/digit cycle repeats every 30 years, so a bare character is
// ambiguous (e.g. 'A' => 1980 or 2010). Resolved by picking whichever
// candidate is closest to the vehicle's own recorded `year` (already on
// file from vehicle creation), rather than guessing.
const YEAR_CODES: Record<string, number> = {
  A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987,
  J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995,
  T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006, '7': 2007, '8': 2008, '9': 2009,
}

export function decodeModelYear(vin: string, knownYear?: number): number | null {
  const char = vin[9]?.toUpperCase()
  const base = char ? YEAR_CODES[char] : undefined
  if (base === undefined) return null

  const candidates = [base, base + 30]
  if (knownYear == null) {
    const currentYear = new Date().getFullYear()
    return candidates.filter((c) => c <= currentYear).pop() ?? base
  }
  return candidates.reduce((closest, c) => (Math.abs(c - knownYear) < Math.abs(closest - knownYear) ? c : closest))
}

const DACIA_WMI: Record<string, string> = {
  UU1: 'Mioveni, Romania',
  UU2: 'Mioveni, Romania',
  UU6: 'Mioveni, Romania',
}

function decodeLocal(vin: string, knownYear?: number): DecodedVin | null {
  const wmi = vin.slice(0, 3).toUpperCase()
  const factory = DACIA_WMI[wmi]
  if (!factory) return null
  return {
    manufacturer: 'Dacia',
    factory,
    modelYear: decodeModelYear(vin, knownYear),
    engineCode: null,
    bodyStyle: null,
    colorCode: null,
  }
}

interface NhtsaVinResult {
  Make?: string
  ModelYear?: string
  PlantCountry?: string
  EngineModel?: string
  EngineConfiguration?: string
  BodyClass?: string
}

export async function decodeViaNhtsa(vin: string): Promise<DecodedVin | null> {
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`
    )
    if (!res.ok) return null
    const data = (await res.json()) as { Results?: NhtsaVinResult[] }
    const result = data.Results?.[0]
    if (!result?.Make) return null

    return {
      manufacturer: result.Make,
      modelYear: result.ModelYear ? Number(result.ModelYear) : null,
      factory: result.PlantCountry || null,
      engineCode: result.EngineModel || result.EngineConfiguration || null,
      bodyStyle: result.BodyClass || null,
      colorCode: null,
    }
  } catch {
    return null
  }
}

export interface VinDecodeResult {
  decoded: DecodedVin
  source: VinDecodeSource
}

/** Returns null when the VIN can't be decoded by either path — the caller should fall back to manual entry. */
export async function decodeVin(vin: string, knownYear?: number): Promise<VinDecodeResult | null> {
  const normalized = vin.trim().toUpperCase()
  if (!isValidVinFormat(normalized)) return null

  const local = decodeLocal(normalized, knownYear)
  if (local) return { decoded: local, source: 'local' }

  const nhtsa = await decodeViaNhtsa(normalized)
  if (nhtsa) return { decoded: nhtsa, source: 'nhtsa' }

  return null
}
