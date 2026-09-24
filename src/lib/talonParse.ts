/**
 * Reading a Romanian registration certificate (the talon, *certificat de
 * înmatriculare*) into the vehicle's identity fields. Same engine, same
 * rules as the receipt and invoice scanners (RL-048): read on the device,
 * **proposed, never saved**, and a value read below `MIN_CONFIDENCE` or
 * failing its check is left empty with a flag rather than guessed.
 *
 * The talon prints every field beside its harmonised EU code (Directive
 * 1999/37/EC), so each value is found by its code, not by its position:
 *
 * | code | field                         | goes to                  |
 * |------|-------------------------------|--------------------------|
 * | A    | registration number           | `plate`                  |
 * | B    | date of first registration    | `firstRegistrationDate`  |
 * | D.1  | make                          | `make`                   |
 * | D.3  | commercial description        | `model`                  |
 * | E    | VIN                           | `vin`                    |
 * | P.1  | engine capacity (cm³)         | `engineCapacityCc`       |
 * | P.2  | max net power (kW)            | `powerKw`                |
 * | P.3  | fuel                          | `fuelType`               |
 * | R    | colour                        | `colour`                 |
 * | S.1  | seats, driver included        | `seats`                  |
 *
 * **The holder is never read.** C.1/C.2 are the owner's name, address and
 * personal number; nothing here matches them, nothing proposes them, and
 * the photo is never uploaded (the scan button says so).
 *
 * Two things are refused rather than guessed:
 * - **A hybrid.** The talon prints "BENZINA/ELECTRIC" for a hybrid and a
 *   plug-in alike, and which one it is changes whether the charging log
 *   applies. The fuel is left empty with its own flag (`hybridAmbiguous`).
 * - **The year.** Nothing on the talon is the model year; B is when it was
 *   first registered, which for an import can be years later. B fills the
 *   first-registration date and nothing else.
 */

import {
  MIN_CONFIDENCE,
  confidenceOf,
  indexLine,
  isoDay,
  mergeSplitRows,
  missing,
  normalise,
  pickOne,
  rawTextOf,
  unsure,
  type IndexedLine,
  type OcrLine,
  type ProposedField,
} from './ocrText'
import { COLOUR_MAX_LENGTH, RANGES, type FuelType } from './vehicleProfile'

export interface TalonProposal {
  plate: ProposedField<string>
  firstRegistrationDate: ProposedField<string>
  make: ProposedField<string>
  model: ProposedField<string>
  vin: ProposedField<string>
  engineCapacityCc: ProposedField<number>
  powerKw: ProposedField<number>
  fuelType: ProposedField<FuelType>
  colour: ProposedField<string>
  seats: ProposedField<number>
  /** P.3 names fuel and electricity: hybrid or plug-in, the owner picks. */
  hybridAmbiguous: boolean
}

export type TalonField = Exclude<keyof TalonProposal, 'hybridAmbiguous'>
export const TALON_FIELDS: readonly TalonField[] = [
  'plate',
  'firstRegistrationDate',
  'make',
  'model',
  'vin',
  'engineCapacityCc',
  'powerKw',
  'fuelType',
  'colour',
  'seats',
]

/** Romanian county codes — a plate-shaped string elsewhere on the card must start with one. */
const COUNTIES = new Set([
  'AB', 'AG', 'AR', 'B', 'BC', 'BH', 'BN', 'BR', 'BT', 'BV', 'BZ', 'CJ', 'CL', 'CS', 'CT', 'CV', 'DB', 'DJ', 'GJ', 'GL',
  'GR', 'HD', 'HR', 'IF', 'IL', 'IS', 'MH', 'MM', 'MS', 'NT', 'OT', 'PH', 'SB', 'SJ', 'SM', 'SV', 'TL', 'TM', 'TR', 'VL',
  'VN', 'VS',
])

/** ISO 3779: 17 characters, never I, O or Q. */
const VIN_FORMAT = /^[A-HJ-NPR-Z0-9]{17}$/

type Found = { text: string; raw: string; confidence: number }

/**
 * Where one field's value ends: the next code on the card. Two columns of
 * the card often come back as one row (mergeSplitRows joins what sits side
 * by side), so "D.1 DACIA D.2 SD" must stop at D.2.
 */
const NEXT_CODE = /\s(?:[A-Z]\s?[.,]\s?[0-9IL](?:\s?[.,]\s?[0-9IL])?|[ABEHIJKQR])(?=\s|$)/

/** The code itself, allowing the misreads a dot and a 1 suffer: D.1, D1, D,1, D.l, D.I. */
function codePattern(letter: string, digit?: string): RegExp {
  const suffix = digit ? String.raw`\s?[.,]?\s?${digit === '1' ? '[1IL]' : digit}` : ''
  return new RegExp(String.raw`(?:^|\s)${letter}${suffix}(?:\s?[.:])?(?=\s|$)`)
}

/**
 * The text printed after a code: the rest of its row up to the next code,
 * or — when the code sits alone on its row, the value printed under it —
 * the next row.
 */
function valueAfter(lines: IndexedLine[], code: RegExp, want: RegExp = /./): Found | null {
  // `want` is what the value must look like; a code matched inside other
  // text ("A B 123 ABC" has a B in it) gives something else and is passed over.
  const every = new RegExp(code.source, 'g')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const match of line.text.matchAll(every)) {
      let start = (match.index ?? 0) + match[0].length
      while (line.text[start] === ' ') start++
      const rest = cutAtNextCode(line.text.slice(start))
      if (rest && want.test(rest)) {
        return { text: rest, raw: rawTextOf(line, start, start + rest.length), confidence: confidenceOf(line, start, start + rest.length) }
      }
      const next = lines[i + 1]
      if (rest || !next || /^(?:[A-Z]\s?[.,]\s?[0-9IL]|[A-Z])(?=\s|$)/.test(next.text)) continue
      const value = cutAtNextCode(next.text)
      if (value && want.test(value)) return { text: value, raw: rawTextOf(next, 0, value.length), confidence: confidenceOf(next, 0, value.length) }
    }
  }
  return null
}

function cutAtNextCode(text: string): string {
  const cut = NEXT_CODE.exec(' ' + text)
  // The match starts at the space before the code, one character later in the padded string.
  return (cut ? text.slice(0, Math.max(0, cut.index - 1)) : text).trim()
}

function accept<T>(found: Found | null, value: T | null): ProposedField<T> {
  if (!found) return missing()
  if (value === null || found.confidence < MIN_CONFIDENCE) return unsure()
  return { value, state: 'read' }
}

/** "SANDERO STEPWAY" → "Sandero Stepway"; a word with a digit is kept as printed. */
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (/\d/.test(word) ? word.toUpperCase() : word.replace(/(^|-)(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())))
    .join(' ')
}

function readPlate(lines: IndexedLine[]): ProposedField<string> {
  const plate = /^([A-Z]{1,2})\s?(\d{2,3})\s?([A-Z]{3})\b/
  const shape = (county: string, digits: string, letters: string) =>
    COUNTIES.has(county) && (county === 'B' ? digits.length >= 2 : digits.length === 2) && !/[IO]/.test(letters.slice(0, 1))
  // The labelled one first: "A B 123 ABC" (the plate's own B is not field B).
  for (const line of lines) {
    const m = /(?:^|\s)A(?:\s?[.:])?\s+([A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3})\b/.exec(line.text)
    if (!m) continue
    const p = plate.exec(m[1])
    if (!p || !shape(p[1], p[2], p[3])) return unsure()
    const at = m.index + m[0].length - m[1].length
    const confidence = confidenceOf(line, at, at + m[1].length)
    return confidence < MIN_CONFIDENCE ? unsure() : { value: `${p[1]} ${p[2]} ${p[3]}`, state: 'read' }
  }
  // Else a plate-shaped string with a real county code, anywhere.
  for (const line of lines) {
    for (const m of line.text.matchAll(/(?:^|\s)([A-Z]{1,2})\s?(\d{2,3})\s?([A-Z]{3})(?=\s|$)/g)) {
      if (!shape(m[1], m[2], m[3])) continue
      const at = (m.index ?? 0) + m[0].length - (m[0].trimStart().length)
      const confidence = confidenceOf(line, at, at + m[0].trim().length)
      return confidence < MIN_CONFIDENCE ? unsure() : { value: `${m[1]} ${m[2]} ${m[3]}`, state: 'read' }
    }
  }
  return missing()
}

/** Letters a VIN can't hold, read for the digits they look like. */
const repairVin = (text: string) => text.replace(/[OQ]/g, '0').replace(/I/g, '1')

function readVin(lines: IndexedLine[]): ProposedField<string> {
  const labelled = valueAfter(lines, codePattern('E'), /^[A-Z0-9]{3}/)
  if (labelled) {
    const joined = repairVin(labelled.text.replace(/\s/g, ''))
    if (joined.length >= 17) {
      const vin = joined.slice(0, 17)
      if (VIN_FORMAT.test(vin)) return accept(labelled, vin)
    }
  }
  // Any 17-character token that is a VIN once repaired.
  for (const line of lines) {
    for (const m of line.text.matchAll(/(?:^|\s)([A-Z0-9]{17})(?=\s|$)/g)) {
      const vin = repairVin(m[1])
      if (!VIN_FORMAT.test(vin) || !/\d/.test(vin) || !/[A-Z]/.test(vin)) continue
      const at = (m.index ?? 0) + m[0].length - 17
      return accept({ text: vin, raw: vin, confidence: confidenceOf(line, at, at + 17) }, vin)
    }
  }
  return labelled ? unsure() : missing()
}

function readDay(lines: IndexedLine[], today: Date): ProposedField<string> {
  const found = valueAfter(lines, codePattern('B'), /^\d{1,2}\s?[./-]/)
  if (!found) return missing()
  const m = /^(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4})/.exec(found.text)
  if (!m) return unsure()
  const day = isoDay(Number(m[3]), Number(m[2]), Number(m[1]))
  const valid = day !== null && day <= today.toISOString().slice(0, 10) && day >= '1900-01-01'
  return accept(found, valid ? day : null)
}

function readInt(lines: IndexedLine[], code: RegExp, range: { min: number; max: number }): ProposedField<number> {
  const found = valueAfter(lines, code, /^[\dO]/)
  if (!found) return missing()
  const m = /^(\d{1,6})(?:[.,](\d{1,2}))?(?=\s|$|[A-Z])/.exec(found.text.replace(/(?<=\d)O|O(?=\d)/g, '0'))
  if (!m) return unsure()
  // kW is sometimes printed "66,00"; a real fraction is rounded, since the field holds whole kW.
  const value = Math.round(Number(`${m[1]}.${m[2] ?? '0'}`))
  return accept(found, value >= range.min && value <= range.max ? value : null)
}

function readText(lines: IndexedLine[], code: RegExp, max: number): { field: ProposedField<string>; found: Found | null } {
  const found = valueAfter(lines, code, /[A-Z]{2}/)
  if (!found) return { field: missing(), found: null }
  const text = found.text.replace(/[^A-Z0-9 &/-]/g, '').replace(/\s+/g, ' ').trim()
  // A value that is mostly noise is not a name.
  const valid = text.length >= 2 && text.length <= max && /[A-Z]{2}/.test(text)
  return { field: accept(found, valid ? text : null), found }
}

/** P.3 as printed → a fuel code; null for something it cannot be. */
export function fuelFromTalon(text: string): FuelType | 'HYBRID_AMBIGUOUS' | null {
  const t = normalise(text)
  const electric = /ELECTR|\bEL\b/.test(t)
  const petrol = /BENZ/.test(t)
  const diesel = /MOTOR|DIESEL/.test(t)
  const lpg = /GPL|LPG/.test(t)
  if (electric && (petrol || diesel || lpg || /HIBRID|HYBRID/.test(t))) return 'HYBRID_AMBIGUOUS'
  if (/HIBRID|HYBRID/.test(t)) return 'HYBRID_AMBIGUOUS'
  if (electric) return 'ELECTRIC'
  if (lpg) return 'LPG'
  if (diesel) return 'DIESEL'
  if (petrol) return 'PETROL'
  return null
}

export function parseTalon(ocrLines: OcrLine[], today: Date = new Date()): TalonProposal {
  const lines = mergeSplitRows(ocrLines).map(indexLine)

  const make = readText(lines, codePattern('D', '1'), 40)
  const model = readText(lines, codePattern('D', '3'), 60)
  const colour = readText(lines, codePattern('R'), COLOUR_MAX_LENGTH)

  const fuelFound = valueAfter(lines, codePattern('P', '3'), /[A-Z]{2}/)
  const fuel = fuelFound ? fuelFromTalon(fuelFound.text) : null
  const hybridAmbiguous = fuel === 'HYBRID_AMBIGUOUS' && (fuelFound?.confidence ?? 0) >= MIN_CONFIDENCE

  return {
    plate: readPlate(lines),
    firstRegistrationDate: readDay(lines, today),
    make: make.field.state === 'read' ? { value: titleCase(make.field.value!), state: 'read' } : make.field,
    model: model.field.state === 'read' ? { value: titleCase(model.field.value!), state: 'read' } : model.field,
    vin: readVin(lines),
    engineCapacityCc: readInt(lines, codePattern('P', '1'), RANGES.engineCapacityCc),
    powerKw: readInt(lines, codePattern('P', '2'), RANGES.powerKw),
    fuelType: fuel === 'HYBRID_AMBIGUOUS' ? unsure() : accept(fuelFound, fuel),
    colour: colour.field.state === 'read' ? { value: titleCase(colour.field.value!), state: 'read' } : colour.field,
    seats: readInt(lines, codePattern('S', '1'), RANGES.seats),
    hybridAmbiguous,
  }
}

/** Enough to stop after one look: the fields that identify the car. */
export function isTalonComplete(p: TalonProposal): boolean {
  return p.plate.state === 'read' && p.vin.state === 'read' && p.make.state === 'read' && p.model.state === 'read'
}

/** Two looks at the same card: a field read the same way twice, or read once. */
export function mergeTalonProposals(a: TalonProposal, b: TalonProposal): TalonProposal {
  const merged = Object.fromEntries(TALON_FIELDS.map((f) => [f, pickOne(a[f] as ProposedField<unknown>, b[f] as ProposedField<unknown>)]))
  return { ...(merged as Omit<TalonProposal, 'hybridAmbiguous'>), hybridAmbiguous: a.hybridAmbiguous || b.hybridAmbiguous }
}

export function readAnythingFromTalon(p: TalonProposal): boolean {
  return TALON_FIELDS.some((f) => p[f].state === 'read') || p.hybridAmbiguous
}
