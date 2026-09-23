/**
 * RL-048: reading words Tesseract returned — shared by the fuel receipt
 * (receiptParse.ts) and the service invoice (invoiceParse.ts) parsers.
 *
 * Every value read carries the lowest confidence of the words it came
 * from, so a caller can drop a doubtful one instead of proposing it; rows
 * the engine split are put back together from their geometry; numbers and
 * dates are read the Romanian way.
 */

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrWord {
  text: string
  /** 0–100, as Tesseract reports it. */
  confidence: number
  bbox?: Box
}

export interface OcrLine {
  words: OcrWord[]
  /** Where the line sits, tilt included: x0,y0 → x1,y1 along its foot. */
  baseline?: Box
}

export type FieldState = 'read' | 'unsure' | 'missing'

export interface ProposedField<T> {
  value: T | null
  state: FieldState
}

/**
 * Below this a word is as likely misread as not. Tesseract's LSTM reports
 * 90+ for clean print; a smudged digit on thermal paper lands in the 40s–60s.
 */
export const MIN_CONFIDENCE = 70

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

export const missing = <T>(): ProposedField<T> => ({ value: null, state: 'missing' })
export const unsure = <T>(): ProposedField<T> => ({ value: null, state: 'unsure' })

/** A line's text, with each word's span so a match can find its words. */
export interface IndexedLine {
  text: string
  /** Vertical extent on the page, when the words carried boxes. */
  top?: number
  bottom?: number
  /** Each word's place in `text`, its confidence, and how it was printed. */
  spans: { start: number; end: number; confidence: number; raw: string; left?: number }[]
}

export function indexLine(line: OcrLine): IndexedLine {
  let text = ''
  const spans: IndexedLine['spans'] = []
  for (const word of line.words) {
    // Normalised per word, so every span stays aligned with the text the
    // patterns run on.
    const wordText = normalise(word.text)
    if (!wordText) continue
    if (text) text += ' '
    spans.push({ start: text.length, end: text.length + wordText.length, confidence: word.confidence, raw: word.text, left: word.bbox?.x0 })
    text += wordText
  }
  const boxes = line.words.map((w) => w.bbox).filter((b): b is Box => !!b)
  if (boxes.length === 0) return { text, spans }
  return { text, spans, top: Math.min(...boxes.map((b) => b.y0)), bottom: Math.max(...boxes.map((b) => b.y1)) }
}

/** The lowest confidence of the words overlapping [start, end). */
export function confidenceOf(line: IndexedLine, start: number, end: number): number {
  let lowest = 100
  for (const span of line.spans) {
    if (span.start < end && span.end > start) lowest = Math.min(lowest, span.confidence)
  }
  return lowest
}

/**
 * The words overlapping [start, end) as they were printed — diacritics and
 * case kept — for a value shown to a person rather than matched (a name).
 */
export function rawTextOf(line: IndexedLine, start: number, end: number): string {
  return line.spans
    .filter((span) => span.start < end && span.end > start)
    .map((span) => span.raw)
    .join(' ')
}

/** Upper-cased, diacritics stripped: the matching form of a line. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

export const NUMBER = String.raw`\d[\dOo]*(?:[.,]\d[\dOo]*)*`

export type Read = {
  value: number
  confidence: number
  /** Digits printed after the decimal separator. */
  decimals: number
}

export function decimalsOf(raw: string): number {
  const m = /[.,](\d[\dOo]*)$/.exec(raw.trim())
  return m ? m[1].length : 0
}

export function reading(raw: string, value: number, confidence: number): Read {
  return { value, confidence, decimals: decimalsOf(raw) }
}

export function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max
}

/** A number followed by a unit on the same line: `32,45 LITRI`, `7,19 LEI/L`. */
export function readWithUnit(lines: IndexedLine[], unit: string): Read | null {
  const pattern = new RegExp(String.raw`(${NUMBER})\s*(?:${unit})`)
  for (const line of lines) {
    const match = pattern.exec(line.text)
    if (!match) continue
    const value = parseReceiptNumber(match[1])
    if (value === null) continue
    return reading(match[1], value, confidenceOf(line, match.index, match.index + match[1].length))
  }
  return null
}

/** A number after a label on the same line: `CANTITATE: 32,45`, `PRET UNITAR 7,19`. */
export function readLabelled(lines: IndexedLine[], label: RegExp): Read | null {
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
    return reading(numberMatch[0], value, confidenceOf(line, at, at + numberMatch[0].length))
  }
  return null
}

export function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

export function fullYear(raw: string): number {
  const year = Number(raw)
  return raw.length === 2 ? 2000 + year : year
}

/**
 * The first date that could be the day of the document: `12.09.2026`,
 * `12/09/26`, `2026-09-12`, `12 septembrie 2026`, `12 SEP 2026`. A date in
 * the future, or more than ten years back, is a misread (or a validity or
 * due date printed on it) and is skipped.
 *
 * `prefer` lines are tried first (an invoice's "Data emiterii"), and
 * `skip` lines never (its "Scadenta", which can be in the past too).
 */
export function readDate(
  allLines: IndexedLine[],
  today: Date,
  { prefer, skip }: { prefer?: RegExp; skip?: RegExp } = {}
): { value: string; confidence: number } | null {
  const lines = prefer ? [...allLines.filter((l) => prefer.test(l.text)), ...allLines.filter((l) => !prefer.test(l.text))] : allLines
  // A date is skipped when the nearest label before it is a `skip` one —
  // "Data: 12.09.2026 Scadenta: 12.10.2026" keeps the first.
  const skipped = (text: string, at: number): boolean => {
    if (!skip) return false
    const before = text.slice(0, at)
    const lastSkip = Math.max(-1, ...Array.from(before.matchAll(new RegExp(skip.source, 'g'))).map((m) => m.index ?? -1))
    if (lastSkip === -1) return false
    const lastPrefer = prefer ? Math.max(-1, ...Array.from(before.matchAll(new RegExp(prefer.source, 'g'))).map((m) => m.index ?? -1)) : -1
    return lastSkip > lastPrefer
  }
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
      if (!c.day || c.day > todayKey || c.day < earliest || skipped(text, c.at)) continue
      return { value: c.day, confidence: confidenceOf(line, c.at, c.at + c.length) }
    }
  }
  return null
}

export function field<T>(read: { value: T; confidence: number } | null, valid: (v: T) => boolean = () => true): ProposedField<T> {
  if (!read) return missing()
  if (read.confidence < MIN_CONFIDENCE || !valid(read.value)) return unsure()
  return { value: read.value, state: 'read' }
}

interface RowGeometry {
  line: OcrLine
  left: number
  right: number
  top: number
  height: number
  /** The foot of the row at a given x — follows the tilt of the photo. */
  footAt: (x: number) => number
}

function geometry(line: OcrLine): RowGeometry | null {
  const boxes = line.words.map((w) => w.bbox).filter((b): b is Box => !!b)
  if (boxes.length === 0 || boxes.length !== line.words.length) return null
  const heights = boxes.map((b) => b.y1 - b.y0).sort((a, b) => a - b)
  const b = line.baseline
  const footAt =
    b && b.x1 !== b.x0
      ? (x: number) => b.y0 + ((x - b.x0) * (b.y1 - b.y0)) / (b.x1 - b.x0)
      : (() => {
          const foot = Math.max(...boxes.map((box) => box.y1))
          return () => foot
        })()
  return {
    line,
    left: Math.min(...boxes.map((box) => box.x0)),
    right: Math.max(...boxes.map((box) => box.x1)),
    top: Math.min(...boxes.map((box) => box.y0)),
    height: heights[Math.floor(heights.length / 2)],
    footAt,
  }
}

/**
 * Puts back together the rows Tesseract split. A receipt prints
 * "TOTAL LEI" on the left and "233,32" far to the right, and the engine
 * often returns them as two lines — or two blocks — which leaves a TOTAL
 * with no amount and an amount with no label. Two fragments are one row
 * when they sit side by side and the foot of one, carried along its own
 * slope, lands on the foot of the other: that holds on a tilted photo,
 * where comparing heights alone would join the wrong rows.
 *
 * Lines without word boxes (older callers, tests) are returned as they are.
 */
export function mergeSplitRows(lines: OcrLine[]): OcrLine[] {
  const rows: RowGeometry[] = []
  const untouched: OcrLine[] = []
  for (const line of lines) {
    const g = geometry(line)
    if (!g) {
      untouched.push(line)
      continue
    }
    const partner = rows.find((row) => {
      const apart = g.left >= row.right - 2 || g.right <= row.left + 2
      if (!apart) return false
      const x = g.left >= row.right ? g.left : g.right
      const tolerance = 0.6 * Math.max(row.height, g.height)
      return Math.abs(row.footAt(x) - g.footAt(x)) < tolerance
    })
    if (!partner) {
      rows.push(g)
      continue
    }
    const words = [...partner.line.words, ...line.words].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0))
    // The wider fragment's slope is the better measure of the row's.
    const wider = partner.right - partner.left >= g.right - g.left ? partner : g
    const merged: RowGeometry = {
      line: { words, baseline: wider.line.baseline },
      left: Math.min(partner.left, g.left),
      right: Math.max(partner.right, g.right),
      top: Math.min(partner.top, g.top),
      height: Math.max(partner.height, g.height),
      footAt: wider.footAt,
    }
    rows[rows.indexOf(partner)] = merged
  }
  if (rows.length === 0) return lines
  return [...rows.sort((a, b) => a.top - b.top).map((r) => r.line), ...untouched]
}

export function pickOne<T>(a: ProposedField<T>, b: ProposedField<T>): ProposedField<T> {
  if (a.state === 'read' && b.state === 'read') return a.value === b.value ? a : unsure()
  if (a.state === 'read') return a
  if (b.state === 'read') return b
  return a.state === 'unsure' || b.state === 'unsure' ? unsure() : missing()
}
