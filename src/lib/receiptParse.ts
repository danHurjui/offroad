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

import {
  MIN_CONFIDENCE,
  NUMBER,
  confidenceOf,
  field,
  inRange,
  mergeSplitRows,
  normalise,
  parseReceiptNumber,
  pickOne,
  readDate,
  readLabelled,
  readWithUnit,
  reading,
  indexLine,
  unsure,
  type IndexedLine,
  type OcrLine,
  type ProposedField,
  type Read,
} from './ocrText'

export { MIN_CONFIDENCE, mergeSplitRows, parseReceiptNumber }
export type { Box, FieldState, OcrLine, OcrWord, ProposedField } from './ocrText'

export interface ReceiptProposal {
  /** ISO day, `YYYY-MM-DD`. */
  date: ProposedField<string>
  station: ProposedField<string>
  litres: ProposedField<number>
  pricePerLitre: ProposedField<number>
  totalRon: ProposedField<number>
}

/**
 * How far litres × price may sit from the amount charged. It is worked out
 * from what the receipt printed, not fixed: litres and price are each off
 * by up to half a unit in their last printed digit, and the pump rounds the
 * amount to the ban. A fixed allowance was loose enough to let `25,000` L
 * read as `25,006` through (0.04 lei out), so it is not one.
 */
export function arithmeticTolerance(litres: Read, price: Read): number {
  const half = (decimals: number) => 0.5 * 10 ** -decimals
  return half(2) + price.value * half(litres.decimals) + litres.value * half(price.decimals) + 1e-9
}

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

/**
 * Litres × price on one line — `32,45 L x 7,19`, `32.450 LITRI * 7.190
 * LEI/L` — and the amount the pump charged for them: after the price on
 * the same row (`= 441,41 B`), or alone on the row below (`233,32 B`).
 */
function readQuantityLine(lines: IndexedLine[]): { litres: Read; price: Read; amount: Read | null } | null {
  const pattern = new RegExp(String.raw`(${NUMBER})\s*(?:L|LT|LTR|LITRI|LITRU)\b\.?\s*[X×*]\s*(${NUMBER})`, 'i')
  const lone = new RegExp(String.raw`^=?\s*(${NUMBER})(?:\s+[A-E])?$`)
  for (const [index, line] of lines.entries()) {
    const match = pattern.exec(line.text)
    if (!match) continue
    const litres = parseReceiptNumber(match[1])
    const price = parseReceiptNumber(match[2])
    if (litres === null || price === null) continue
    const litresAt = match.index
    const priceAt = match.index + match[0].lastIndexOf(match[2])

    let amount: Read | null = null
    const rest = match.index + match[0].length
    const after = new RegExp(String.raw`^\s*(?:(?:LEI|RON)\s*\/\s*L(?:ITRU)?\b)?\s*=?\s*(${NUMBER})`).exec(line.text.slice(rest))
    if (after) {
      const at = rest + after[0].length - after[1].length
      const value = parseReceiptNumber(after[1])
      if (value !== null) amount = reading(after[1], value, confidenceOf(line, at, at + after[1].length))
    } else if (lines[index + 1]) {
      const next = lines[index + 1]
      const m = lone.exec(next.text)
      const value = m ? parseReceiptNumber(m[1]) : null
      if (m && value !== null) {
        const at = next.text.indexOf(m[1])
        amount = reading(m[1], value, confidenceOf(next, at, at + m[1].length))
      }
    }
    return {
      litres: reading(match[1], litres, confidenceOf(line, litresAt, litresAt + match[1].length)),
      price: reading(match[2], price, confidenceOf(line, priceAt, priceAt + match[2].length)),
      amount,
    }
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
    return reading(last[0], value, confidenceOf(line, last.index, last.index + last[0].length))
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

/** Reads a fuel receipt's lines into a proposal. `today` bounds the date. */
export function parseFuelReceipt(ocrLines: OcrLine[], today: Date = new Date()): ReceiptProposal {
  const lines = mergeSplitRows(ocrLines).map(indexLine).filter((l) => l.text.trim() !== '')

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
  // Checks run on what was read, before the confidence cut, so they use
  // the printed precision; a doubtful value has already been emptied.
  const agrees = (amountRon: number) =>
    litresRead !== null &&
    priceRead !== null &&
    Math.abs(litresRead.value * priceRead.value - amountRon) <= arithmeticTolerance(litresRead, priceRead)

  // The fuel line's own amount checks litres × price first. When they
  // agree it is also the better total for a *fuel* entry: the receipt's
  // TOTAL includes the coffee.
  const amount = field(quantity?.amount ?? null, (v) => inRange(v, TOTAL_RANGE))
  const { litres, pricePerLitre } = proposal
  if (amount.value !== null && litres.value !== null && pricePerLitre.value !== null) {
    if (agrees(amount.value)) {
      proposal.totalRon = { value: amount.value, state: 'read' }
      return proposal
    }
    proposal.litres = unsure()
    proposal.pricePerLitre = unsure()
    // Which of the three was misread is unknowable; the receipt's TOTAL,
    // read on its own row, is only kept if it matches the line's amount.
    if (proposal.totalRon.value !== null && Math.abs(proposal.totalRon.value - amount.value) > 0.005) proposal.totalRon = unsure()
    return proposal
  }

  const { totalRon } = proposal
  if (litres.value !== null && pricePerLitre.value !== null && totalRon.value !== null && !agrees(totalRon.value)) {
    proposal.litres = unsure()
    proposal.pricePerLitre = unsure()
    proposal.totalRon = unsure()
  }
  return proposal
}

/**
 * Whether a proposal has everything the fuel form needs from it, checked:
 * the date, and litres and total (which only come out `read` once their
 * arithmetic has agreed).
 */
export function isComplete(proposal: ReceiptProposal): boolean {
  return proposal.date.state === 'read' && proposal.litres.state === 'read' && proposal.totalRon.state === 'read'
}

const MONEY_FIELDS = ['litres', 'pricePerLitre', 'totalRon'] as const

/**
 * Two readings of the same receipt (different page segmentation) combined
 * without weakening either's checks:
 * - litres, price and total travel **together**, from the reading that
 *   verified more of them — taking litres from one and the total from the
 *   other would pair figures no arithmetic ever checked against each other;
 * - a field both readings read, differently, is unsure: one of them is
 *   wrong and nothing says which.
 */
export function mergeProposals(a: ReceiptProposal, b: ReceiptProposal): ReceiptProposal {
  const readCount = (p: ReceiptProposal) => MONEY_FIELDS.filter((f) => p[f].state === 'read').length
  const money = readCount(b) > readCount(a) ? b : a
  const merged: ReceiptProposal = {
    date: pickOne(a.date, b.date),
    station: pickOne(a.station, b.station),
    litres: money.litres,
    pricePerLitre: money.pricePerLitre,
    totalRon: money.totalRon,
  }
  for (const f of MONEY_FIELDS) {
    if (a[f].state === 'read' && b[f].state === 'read' && a[f].value !== b[f].value) merged[f] = unsure()
  }
  return merged
}

/** Whether the scan found anything worth proposing. */
export function readAnything(proposal: ReceiptProposal): boolean {
  return Object.values(proposal).some((f: ProposedField<unknown>) => f.state === 'read')
}
