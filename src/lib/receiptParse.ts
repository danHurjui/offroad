/**
 * RL-048, slice 1: what a photographed fuel receipt says, as a proposal.
 *
 * Pure, and fed by src/lib/ocr.ts (Tesseract.js, on the device). Nothing
 * here decides what is saved — the fuel form shows the proposal and the
 * person confirms it — but three rules make the proposal safe to show:
 *
 * 1. **Low confidence is empty-and-flagged, never a guess.** Every value
 *    carries the lowest recognition confidence of the words it was read
 *    from; below `MIN_CONFIDENCE` it is dropped and the field is `unsure`.
 * 2. **The arithmetic has to agree.** When litres, price per litre and the
 *    total are all read, litres × price must come to the total (to the
 *    rounding a pump does). If it doesn't, one of them is misread and there
 *    is no telling which — all three become `unsure`.
 * 3. **Nothing is derived to fill a gap.** A missing total is not worked
 *    out from litres × price: a figure the app produced itself is exactly
 *    the one nobody re-checks.
 *
 * Romanian receipts specifically: comma decimals, `RON`/`LEI`, Romanian
 * month names, and the chains people fill up at.
 */

export interface OcrWord {
  text: string
  /** 0–100, as Tesseract reports it. */
  confidence: number
}

export interface OcrLine {
  words: OcrWord[]
}

export type FieldState = 'read' | 'unsure' | 'missing'

export interface ProposedField<T> {
  value: T | null
  state: FieldState
}

export interface ReceiptProposal {
  /** ISO day, `YYYY-MM-DD`. */
  date: ProposedField<string>
  station: ProposedField<string>
  litres: ProposedField<number>
  pricePerLitre: ProposedField<number>
  totalRon: ProposedField<number>
}

/**
 * Below this a word is as likely misread as not. Tesseract's LSTM reports
 * 90+ for clean print; a smudged digit on thermal paper lands in the 40s–60s.
 */
export const MIN_CONFIDENCE = 70

/** How far litres × price may sit from the total: pumps round each. */
const ARITHMETIC_TOLERANCE_RON = 0.1

const LITRES_RANGE = { min: 0.5, max: 2000 }
const PRICE_RANGE = { min: 1, max: 50 }
const TOTAL_RANGE = { min: 1, max: 100_000 }

/**
 * The chains, most specific first: "OMV PETROM" is how both OMV and
 * Petrom stations print their company name, so the OMV brand line wins
 * only when it stands alone. `0` for `O` is the commonest OCR slip on a
 * header.
 */
const STATIONS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bROMPETROL\b/, name: 'Rompetrol' },
  { pattern: /\bLUKOIL\b/, name: 'Lukoil' },
  { pattern: /\bSOCAR\b/, name: 'Socar' },
  { pattern: /\bGAZPROM\b/, name: 'Gazprom' },
  { pattern: /\bM[O0]L\b/, name: 'MOL' },
  { pattern: /\b[O0]MV\b(?!\s*PETR[O0]M)/, name: 'OMV' },
  // Not the "OMV PETROM MARKETING" company line, which both brands print.
  { pattern: /(?<![O0]MV\s)\bPETR[O0]M\b/, name: 'Petrom' },
  { pattern: /\bAVIA\b/, name: 'Avia' },
  { pattern: /\bARTOIL\b/, name: 'Artoil' },
]

const MONTHS: Record<string, number> = {
  ian: 1, ianuarie: 1,
  feb: 2, februarie: 2,
  mar: 3, martie: 3,
  apr: 4, aprilie: 4,
  mai: 5,
  iun: 6, iunie: 6,
  iul: 7, iulie: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, septembrie: 9,
  oct: 10, octombrie: 10,
  noi: 11, nov: 11, noiembrie: 11,
  dec: 12, decembrie: 12,
}

const missing = <T>(): ProposedField<T> => ({ value: null, state: 'missing' })
const unsure = <T>(): ProposedField<T> => ({ value: null, state: 'unsure' })

/** A line's text, with each word's span so a match can find its words. */
interface IndexedLine {
  text: string
  spans: { start: number; end: number; confidence: number }[]
}

function indexLine(line: OcrLine): IndexedLine {
  let text = ''
  const spans: IndexedLine['spans'] = []
  for (const word of line.words) {
    // Normalised per word, so every span stays aligned with the text the
    // patterns run on.
    const wordText = normalise(word.text)
    if (!wordText) continue
    if (text) text += ' '
    spans.push({ start: text.length, end: text.length + wordText.length, confidence: word.confidence })
    text += wordText
  }
  return { text, spans }
}

/** The lowest confidence of the words overlapping [start, end). */
function confidenceOf(line: IndexedLine, start: number, end: number): number {
  let lowest = 100
  for (const span of line.spans) {
    if (span.start < end && span.end > start) lowest = Math.min(lowest, span.confidence)
  }
  return lowest
}

/** Upper-cased, diacritics stripped: the matching form of a line. */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/**
 * A receipt number: `233,32`, `233.32`, `1.234,56`, `32,450`. One
 * separator is the decimal point whichever it is; with both, the last one
 * is. `O`/`o` read for `0` inside digits is repaired, nothing bolder.
 */
export function parseReceiptNumber(raw: string): number | null {
  const cleaned = raw.replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, '0').replace(/\s/g, '')
  if (!/^\d+([.,]\d+)*$/.test(cleaned)) return null
  const lastSep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','))
  const normalised =
    lastSep === -1 ? cleaned : cleaned.slice(0, lastSep).replace(/[.,]/g, '') + '.' + cleaned.slice(lastSep + 1)
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

const NUMBER = String.raw`\d[\dOo]*(?:[.,]\d[\dOo]*)*`

type Read = { value: number; confidence: number }

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max
}

/** Litres × price on one line: `32,45 L x 7,19`, `32.450 LITRI * 7.190 LEI/L`. */
function readQuantityLine(lines: IndexedLine[]): { litres: Read; price: Read } | null {
  const pattern = new RegExp(String.raw`(${NUMBER})\s*(?:L|LT|LTR|LITRI|LITRU)\b\.?\s*[X×*]\s*(${NUMBER})`, 'i')
  for (const line of lines) {
    const match = pattern.exec(normalise(line.text))
    if (!match) continue
    const litres = parseReceiptNumber(match[1])
    const price = parseReceiptNumber(match[2])
    if (litres === null || price === null) continue
    const litresAt = match.index
    const priceAt = match.index + match[0].lastIndexOf(match[2])
    return {
      litres: { value: litres, confidence: confidenceOf(line, litresAt, litresAt + match[1].length) },
      price: { value: price, confidence: confidenceOf(line, priceAt, priceAt + match[2].length) },
    }
  }
  return null
}

/** A number followed by a unit on the same line: `32,45 LITRI`, `7,19 LEI/L`. */
function readWithUnit(lines: IndexedLine[], unit: string): Read | null {
  const pattern = new RegExp(String.raw`(${NUMBER})\s*(?:${unit})`)
  for (const line of lines) {
    const match = pattern.exec(line.text)
    if (!match) continue
    const value = parseReceiptNumber(match[1])
    if (value === null) continue
    return { value, confidence: confidenceOf(line, match.index, match.index + match[1].length) }
  }
  return null
}

/** A number after a label on the same line: `CANTITATE: 32,45`, `PRET UNITAR 7,19`. */
function readLabelled(lines: IndexedLine[], label: RegExp): Read | null {
  for (const line of lines) {
    const text = normalise(line.text)
    const labelMatch = label.exec(text)
    if (!labelMatch) continue
    const after = labelMatch.index + labelMatch[0].length
    const numberMatch = new RegExp(NUMBER).exec(text.slice(after))
    if (!numberMatch) continue
    const value = parseReceiptNumber(numberMatch[0])
    if (value === null) continue
    const at = after + numberMatch.index
    return { value, confidence: confidenceOf(line, at, at + numberMatch[0].length) }
  }
  return null
}

/**
 * The amount paid: the last number on a `TOTAL` line — not a subtotal,
 * and not the VAT line (`TOTAL TVA`), which is the one most often mistaken
 * for it.
 */
function readTotal(lines: IndexedLine[]): Read | null {
  for (const line of lines) {
    const text = normalise(line.text)
    if (!/(^|[^A-Z])TOTAL\b/.test(text) || /SUBTOTAL|\bTVA\b|\bTAXA\b/.test(text)) continue
    const numbers = Array.from(text.matchAll(new RegExp(NUMBER, 'g')))
    const last = numbers[numbers.length - 1]
    if (!last || last.index === undefined) continue
    const value = parseReceiptNumber(last[0])
    if (value === null) continue
    return { value, confidence: confidenceOf(line, last.index, last.index + last[0].length) }
  }
  return null
}

function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

function fullYear(raw: string): number {
  const year = Number(raw)
  return raw.length === 2 ? 2000 + year : year
}

/**
 * The first date that could be the day of the fill-up: `12.09.2026`,
 * `12/09/26`, `2026-09-12`, `12 septembrie 2026`, `12 SEP 2026`. A date in
 * the future, or more than ten years back, is a misread (or a validity
 * date printed on the receipt) and is skipped.
 */
function readDate(lines: IndexedLine[], today: Date): { value: string; confidence: number } | null {
  const numeric = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  const named = /\b(\d{1,2})\s*[ .-]?\s*([A-Z]{3,10})\.?\s*[ .-]?\s*(\d{4})\b/g
  const todayKey = today.toISOString().slice(0, 10)
  const earliest = `${today.getUTCFullYear() - 10}-01-01`

  for (const line of lines) {
    const text = normalise(line.text)
    const candidates: { at: number; length: number; day: string | null }[] = []
    for (const m of text.matchAll(iso)) {
      candidates.push({ at: m.index ?? 0, length: m[0].length, day: isoDay(Number(m[1]), Number(m[2]), Number(m[3])) })
    }
    for (const m of text.matchAll(numeric)) {
      candidates.push({ at: m.index ?? 0, length: m[0].length, day: isoDay(fullYear(m[3]), Number(m[2]), Number(m[1])) })
    }
    for (const m of text.matchAll(named)) {
      const month = MONTHS[m[2].toLowerCase()]
      if (!month) continue
      candidates.push({ at: m.index ?? 0, length: m[0].length, day: isoDay(Number(m[3]), month, Number(m[1])) })
    }
    candidates.sort((a, b) => a.at - b.at)
    for (const c of candidates) {
      if (!c.day || c.day > todayKey || c.day < earliest) continue
      return { value: c.day, confidence: confidenceOf(line, c.at, c.at + c.length) }
    }
  }
  return null
}

function readStation(lines: IndexedLine[]): { value: string; confidence: number } | null {
  // The chain is printed in the header; looking further down finds
  // "LUKOIL" in a loyalty-card footer on somebody else's receipt. A big
  // bold logo line is often read with less confidence than the small print
  // under it, so a confident match anywhere in the header wins over a
  // doubtful one above it.
  let doubtful: { value: string; confidence: number } | null = null
  for (const line of lines.slice(0, 8)) {
    for (const station of STATIONS) {
      const m = station.pattern.exec(line.text)
      if (!m) continue
      const read = { value: station.name, confidence: confidenceOf(line, m.index, m.index + m[0].length) }
      if (read.confidence >= MIN_CONFIDENCE) return read
      doubtful ??= read
    }
  }
  return doubtful
}

function field<T>(read: { value: T; confidence: number } | null, valid: (v: T) => boolean = () => true): ProposedField<T> {
  if (!read) return missing()
  if (read.confidence < MIN_CONFIDENCE || !valid(read.value)) return unsure()
  return { value: read.value, state: 'read' }
}

/** Reads a fuel receipt's lines into a proposal. `today` bounds the date. */
export function parseFuelReceipt(ocrLines: OcrLine[], today: Date = new Date()): ReceiptProposal {
  const lines = ocrLines.map(indexLine).filter((l) => l.text.trim() !== '')

  const quantity = readQuantityLine(lines)
  const litresRead =
    quantity?.litres ??
    readLabelled(lines, /\b(?:CANTITATE|CANT\.|VOLUM)\s*:?/) ??
    readWithUnit(lines, String.raw`(?:LITRI|LITRU|LTR|L)\b(?!\s*\/)`)
  const priceRead =
    quantity?.price ??
    readLabelled(lines, /\bPRET\s*(?:UNITAR|\/\s*L(?:ITRU)?)?\s*:?/) ??
    readWithUnit(lines, String.raw`(?:LEI|RON)\s*\/\s*L(?:ITRU)?\b`)

  const proposal: ReceiptProposal = {
    date: field(readDate(lines, today)),
    station: field(readStation(lines)),
    litres: field(litresRead, (v) => inRange(v, LITRES_RANGE)),
    pricePerLitre: field(priceRead, (v) => inRange(v, PRICE_RANGE)),
    totalRon: field(readTotal(lines), (v) => inRange(v, TOTAL_RANGE)),
  }

  const { litres, pricePerLitre, totalRon } = proposal
  if (litres.value !== null && pricePerLitre.value !== null && totalRon.value !== null) {
    const expected = litres.value * pricePerLitre.value
    if (Math.abs(expected - totalRon.value) > ARITHMETIC_TOLERANCE_RON) {
      proposal.litres = unsure()
      proposal.pricePerLitre = unsure()
      proposal.totalRon = unsure()
    }
  }
  return proposal
}

/** Whether the scan found anything worth proposing. */
export function readAnything(proposal: ReceiptProposal): boolean {
  return Object.values(proposal).some((f: ProposedField<unknown>) => f.state === 'read')
}
