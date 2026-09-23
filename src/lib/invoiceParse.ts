/**
 * RL-048, slice 2: what a photographed service invoice says, as a proposal
 * for a workshop job — parts, labour, the workshop, the date, the km.
 *
 * Same rules as the fuel receipt (receiptParse.ts), and one more that an
 * invoice needs:
 *
 * - **Money is only proposed when the lines add up.** The item amounts
 *   must sum to the invoice's amount to pay ("total de plată"), or no
 *   parts/labour figure is proposed at all. An invoice prints its lines
 *   one of two ways — gross per line, or a net value with the VAT beside
 *   it — and each reading is tried; the one that reaches the printed
 *   total is the one used. Neither does → unsure, with the items left out.
 *   A total spread over parts and labour by a VAT rate would be a figure
 *   the app made up, so an invoice that only prints VAT in its footer
 *   gets no split.
 * - **Every figure used must be confidently read.** One smudged line
 *   amount makes the whole sum unsure, not just that line.
 * - Parts vs labour is decided per line from its wording (and an hours
 *   unit), and each line is listed in the job's notes with its amount, so
 *   the person sees how it was split before saving.
 */

import {
  MIN_CONFIDENCE,
  NUMBER,
  confidenceOf,
  decimalsOf,
  field,
  inRange,
  indexLine,
  mergeSplitRows,
  missing,
  parseReceiptNumber,
  pickOne,
  rawTextOf,
  readDate,
  reading,
  unsure,
  type IndexedLine,
  type OcrLine,
  type ProposedField,
  type Read,
} from './ocrText'
import { MAX_KM } from './odometer'

export interface InvoiceItem {
  /** As printed. */
  description: string
  /** What was paid for the line, VAT included. */
  amountRon: number
  kind: 'labour' | 'part'
}

export interface InvoiceProposal {
  /** ISO day of issue. */
  date: ProposedField<string>
  workshop: ProposedField<string>
  /** Series and number, as printed: `AB 1234`. */
  invoiceNumber: ProposedField<string>
  km: ProposedField<number>
  partsRon: ProposedField<number>
  labourRon: ProposedField<number>
  /** The amount to pay the lines were checked against. */
  totalRon: ProposedField<number>
  /** Only when they added up to `totalRon`; empty otherwise. */
  items: InvoiceItem[]
}

const AMOUNT_RANGE = { min: 0.01, max: 1_000_000 }
const WORKSHOP_MAX_LENGTH = 80

/** Wording that makes a line labour rather than a part. */
const LABOUR =
  /MANOPER|\bORE\b|\bORA\b|SERVICI|DIAGNOZ|DIAGNOST|REGLAJ|MONTAJ|MONTAT|DEMONTA|INLOCUI|SCHIMB|VERIFICA|REPARA|RECONDITION|ECHILIBR|GEOMETRI|VULCANIZ|OPERATI|LUCRAR|REVIZI|INSPECTI|TESTARE|CURATA|SPALA|INCARCARE|VOPSI|TINICHIG|POLISA|ALINIER/
/** A unit column: where a row's description ends. */
const UNIT = /^(?:BUC|BUC\.|BUCATI|L|LITRI|ORE|ORA|H|HR|NH|SET|KIT|KG|M|PCS|PERECHE|OP)$/
/** A unit in hours makes it labour whatever it is called. */
const HOURS_UNIT = /\b(?:ORE|ORA|H|HR|NH)\b/

const SUPPLIER_LABEL = /\b(?:FURNIZOR|VANZATOR|PRESTATOR|EMITENT)\b\s*[:;.]?/
const CUSTOMER_LABEL = /\b(?:CUMPARATOR|CLIENT|BENEFICIAR|CATRE)\b/
const COMPANY = /\b(?:S\.?\s?R\.?\s?L|S\.?\s?A|P\.?\s?F\.?\s?A|I\.?\s?I)\b\.?/

/** Where the table of lines starts: its header row. */
const TABLE_HEADER = /\b(?:DENUMIRE|DESCRIERE|PRODUS|ARTICOL|NR\.?\s*CRT)\b/
/** Where it ends: the first total. */
const TABLE_END = /(^|[^A-Z])(?:SUB)?TOTAL\b|DE\s*PLATA/

/**
 * The amount to pay: the most specific label first. A bare `TOTAL` counts
 * only when it carries a single figure — on most invoices that row prints
 * the net total and the VAT side by side, and neither is what was paid.
 */
function readAmountToPay(lines: IndexedLine[]): Read | null {
  const specific = /DE\s*PLATA|TOTAL\s*(?:FACTURA|GENERAL|CU\s*TVA)/
  const lastNumber = (line: IndexedLine, only = false): Read | null => {
    const numbers = Array.from(line.text.matchAll(new RegExp(NUMBER, 'g'))).filter((m) => decimalsOf(m[0]) === 2)
    if (numbers.length === 0 || (only && numbers.length !== 1)) return null
    const last = numbers[numbers.length - 1]
    const value = parseReceiptNumber(last[0])
    if (value === null || last.index === undefined) return null
    return reading(last[0], value, confidenceOf(line, last.index, last.index + last[0].length))
  }
  for (const line of lines) {
    if (specific.test(line.text)) {
      const read = lastNumber(line)
      if (read) return read
    }
  }
  for (const line of lines) {
    if (/(^|[^A-Z])TOTAL\b/.test(line.text) && !/SUBTOTAL|\bTVA\b|MANOPER|PIESE|MATERIAL/.test(line.text)) {
      const read = lastNumber(line, true)
      if (read) return read
    }
  }
  return null
}

interface Row {
  description: string
  /** The money figures on the row, left to right (two decimals: not a quantity). */
  amounts: (Read & { left?: number })[]
  labour: boolean
  /** Vertical centre on the page, when known. */
  centre?: number
  /** Figures with no description: only ever joined to a neighbour. */
  fragment?: boolean
}

/** Description text waiting for the row it belongs to. */
type Pending = { raw: string; labour: boolean; centre?: number }

const centreOf = (line: IndexedLine) => (line.top !== undefined && line.bottom !== undefined ? (line.top + line.bottom) / 2 : undefined)

/**
 * The table's rows: a description, then figures. A description that ran
 * onto a second line (letters, no figures) is joined to the row it is
 * nearest to on the page: invoices align cells to the top (the extra line
 * falls below its row) or to the middle (the figures sit between the two
 * lines, and the first line comes before them). Without positions it
 * joins the row above, or the next one if there is none above.
 */
function readRows(lines: IndexedLine[]): Row[] {
  const headerAt = lines.findIndex((l) => TABLE_HEADER.test(l.text))
  const start = headerAt === -1 ? 0 : headerAt + 1
  const rows: Row[] = []
  let pending = null as Pending | null
  for (const line of lines.slice(start)) {
    if (TABLE_END.test(line.text)) break
    // Skip the row number, then the description runs until the first word
    // that is a bare figure or a unit ("5W30" and "H4" stay in it).
    const words = line.spans
    let first = 0
    if (words[0] && /^\d{1,3}[.)]?$/.test(line.text.slice(words[0].start, words[0].end)) && words.length > 1) first = 1
    let last = first
    while (last < words.length) {
      const word = line.text.slice(words[last].start, words[last].end)
      if (/^\d+(?:[.,]\d+)*$/.test(word) || UNIT.test(word)) break
      last++
    }
    if (first >= words.length) continue
    const offset = words[first].start
    const descEnd = last > first ? words[last - 1].end : offset
    const description = line.text.slice(offset, descEnd)
    const amounts = Array.from(line.text.slice(descEnd).matchAll(new RegExp(NUMBER, 'g')))
      .filter((m) => decimalsOf(m[0]) === 2)
      .map((m) => {
        const at = descEnd + (m.index ?? 0)
        const left = line.spans.find((span) => span.start <= at && span.end > at)?.left
        return { ...reading(m[0], parseReceiptNumber(m[0]) ?? NaN, confidenceOf(line, at, at + m[0].length)), left }
      })
      .filter((r) => Number.isFinite(r.value))

    const letters = description.replace(/[^A-Z]/g, '').length
    if (amounts.length === 0) {
      // Before the first row, only a numbered line is an item (its cell
      // wrapped); anything else there is the header's own second line
      // ("produs / serviciu"), and "serviciu" would read as labour.
      if (letters >= 3 && last === words.length && (rows.length > 0 || pending || first === 1)) {
        const raw = rawTextOf(line, offset, line.text.length)
        const held: Pending | null = pending
        pending = held
          ? { raw: `${held.raw} ${raw}`, labour: held.labour || LABOUR.test(description), centre: held.centre }
          : { raw, labour: LABOUR.test(description), centre: centreOf(line) }
      }
      continue
    }
    if (letters < 3) {
      // Figures alone on a line — a wrapped row's value and VAT, or a
      // receipt's line amount printed under its description.
      if (description.replace(/[^A-Z]/g, '') === '' || /^[A-E]?$/.test(description.trim())) {
        rows.push({ description: '', amounts, labour: false, centre: centreOf(line), fragment: true })
      }
      continue
    }
    const unitArea = line.text.slice(descEnd, descEnd + 12)
    const row: Row = {
      description: rawTextOf(line, offset, descEnd),
      amounts,
      labour: LABOUR.test(description) || HOURS_UNIT.test(unitArea),
      centre: centreOf(line),
    }
    const held: Pending | null = pending
    if (held) {
      const previous = rows[rows.length - 1]
      const towardsNext =
        !previous ||
        (held.centre !== undefined &&
          row.centre !== undefined &&
          previous.centre !== undefined &&
          Math.abs(held.centre - row.centre) < Math.abs(held.centre - previous.centre))
      const target = towardsNext ? row : previous
      target.description = towardsNext ? `${held.raw} ${row.description}` : `${previous.description} ${held.raw}`
      target.labour ||= held.labour
      pending = null
    }
    rows.push(row)
  }
  const leftover: Pending | null = pending
  if (leftover && rows.length > 0) {
    const previous = rows[rows.length - 1]
    previous.description += ` ${leftover.raw}`
    previous.labour ||= leftover.labour
  }
  return joinSplitRows(rows)
}

/**
 * A row whose cell wrapped onto two lines can come back as two fragments,
 * each with some of its figures ("Manopera schimb 100,00" / "ulei ore 1,00
 * 100,00 19,00"). Two neighbours that are each short of the table's usual
 * number of figures, and together have exactly that many, are one row —
 * figures put back in page order. The sum check still has to pass after,
 * so a wrong join cannot produce a proposal, only fail to.
 */
function joinSplitRows(rows: Row[]): Row[] {
  const counts = new Map<number, number>()
  // Counted over rows with a description: a fragment is what is short.
  for (const r of rows) if (!r.fragment) counts.set(r.amounts.length, (counts.get(r.amounts.length) ?? 0) + 1)
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
  if (usual < 2) return rows.filter((r) => !r.fragment)
  const out: Row[] = []
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]
    const b = rows[i + 1]
    if (b && a.amounts.length < usual && b.amounts.length < usual && a.amounts.length + b.amounts.length === usual && !(a.fragment && b.fragment)) {
      // Columns (a table cell that wrapped) go back in page order; a line
      // that wrapped whole — its amount starting the next line, left of
      // everything above — stays in reading order.
      const amounts = [...a.amounts, ...b.amounts]
      const positioned = amounts.every((f) => f.left !== undefined)
      const wrapped = positioned && Math.max(...b.amounts.map((f) => f.left!)) < Math.min(...a.amounts.map((f) => f.left!))
      if (positioned && !wrapped) amounts.sort((x, y) => x.left! - y.left!)
      const description = [a.description, b.description].filter(Boolean).join(' ')
      out.push({ description, amounts, labour: a.labour || b.labour, centre: a.fragment ? b.centre : a.centre })
      i++
      continue
    }
    out.push(a)
  }
  // A fragment nobody claimed is dropped; the sum check then says whether
  // the table still adds up without it.
  return out.filter((r) => !r.fragment)
}

/** The allowance for n printed amounts each rounded to the ban. */
const sumTolerance = (n: number) => 0.01 + 0.005 * n

/**
 * Each row's paid amount, under the reading that makes the rows add up to
 * the amount to pay: the last figure (gross per line), or the last two
 * (net value + VAT). Null when neither does, or any figure used is doubtful.
 */
function paidPerRow(rows: Row[], toPay: number): number[] | null {
  const readings: ((r: Row) => Read[] | null)[] = [
    (r) => r.amounts.slice(-1),
    (r) => (r.amounts.length >= 2 ? r.amounts.slice(-2) : null),
  ]
  for (const pick of readings) {
    const used = rows.map(pick)
    if (used.some((u) => u === null)) continue
    const perRow = (used as Read[][]).map((figures) => figures.reduce((sum, f) => sum + f.value, 0))
    const total = perRow.reduce((a, b) => a + b, 0)
    if (Math.abs(total - toPay) > sumTolerance(rows.length)) continue
    if ((used as Read[][]).flat().some((f) => f.confidence < MIN_CONFIDENCE)) return null
    return perRow
  }
  return null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** "TOTAL MANOPERA 200,00" / "TOTAL PIESE 400,00", for invoices that print them. */
function readSummary(lines: IndexedLine[], label: RegExp): Read | null {
  for (const line of lines) {
    if (!label.test(line.text)) continue
    const numbers = Array.from(line.text.matchAll(new RegExp(NUMBER, 'g'))).filter((m) => decimalsOf(m[0]) === 2)
    const last = numbers[numbers.length - 1]
    if (!last || last.index === undefined) continue
    const value = parseReceiptNumber(last[0])
    if (value !== null) return reading(last[0], value, confidenceOf(line, last.index, last.index + last[0].length))
  }
  return null
}

function readWorkshop(lines: IndexedLine[]): { value: string; confidence: number } | null {
  const tidy = (raw: string) => raw.replace(/^[\s:.,-]+|[\s:.,-]+$/g, '').replace(/\s+/g, ' ').slice(0, WORKSHOP_MAX_LENGTH)
  // "Furnizor: SERVICE AUTO SRL", or the label alone with the name below.
  for (const [i, line] of lines.entries()) {
    const label = SUPPLIER_LABEL.exec(line.text)
    if (!label) continue
    const after = label.index + label[0].length
    const rest = line.text.slice(after)
    if (rest.replace(/[^A-Z]/g, '').length >= 3) {
      const cut = CUSTOMER_LABEL.exec(rest)
      const end = after + (cut ? cut.index : rest.length)
      return { value: tidy(rawTextOf(line, after, end)), confidence: confidenceOf(line, after, end) }
    }
    const next = lines[i + 1]
    if (next) return { value: tidy(rawTextOf(next, 0, next.text.length)), confidence: confidenceOf(next, 0, next.text.length) }
  }
  // Otherwise the first company name at the top — never the customer's,
  // which on a company car is the reader's own company.
  let afterCustomer = false
  for (const line of lines.slice(0, 10)) {
    if (CUSTOMER_LABEL.test(line.text)) {
      afterCustomer = true
      continue
    }
    if (afterCustomer) {
      afterCustomer = false
      continue
    }
    const company = COMPANY.exec(line.text)
    if (company && line.text.slice(0, company.index).replace(/[^A-Z]/g, '').length >= 3) {
      const end = company.index + company[0].length
      return { value: tidy(rawTextOf(line, 0, end)), confidence: confidenceOf(line, 0, end) }
    }
  }
  return null
}

function readInvoiceNumber(lines: IndexedLine[]): { value: string; confidence: number } | null {
  // Two patterns, not one with an optional series: a lazy match skips an
  // optional group every time, so the series would never be captured.
  const withSeries = /FACTURA\b.*?\bSERIA\s*:?\s*([A-Z]{1,8})\b.*?\b(?:NR|NUMAR|NO)\.?\s*:?\s*(\d{1,12})\b/
  const numberOnly = /FACTURA\b.*?\b(?:NR|NUMAR|NO)\.?\s*:?\s*([A-Z]{0,8}\s?\d{1,12})\b/
  for (const line of lines) {
    const m = withSeries.exec(line.text)
    if (m) {
      const at = line.text.indexOf(m[1], m.index + 'FACTURA'.length)
      return { value: `${m[1]} ${m[2]}`, confidence: confidenceOf(line, at, m.index + m[0].length) }
    }
    const n = numberOnly.exec(line.text)
    if (n) {
      const at = n.index + n[0].length - n[1].length
      return { value: n[1].trim(), confidence: confidenceOf(line, at, n.index + n[0].length) }
    }
  }
  return null
}

/**
 * The odometer, when the workshop wrote it on the invoice: `KM: 123.456`,
 * `Kilometraj 123456`. Separators in a km are thousands — there are no
 * fractions of a kilometre on an invoice.
 */
function readKm(lines: IndexedLine[]): { value: number; confidence: number } | null {
  // Not followed by more of a number: "201.5O0" misread must not pass as 201.
  const pattern = /\b(?:KM|KILOMETRAJ|KM\s*BORD|RULAJ)\b\.?\s*[:;]?\s*(\d{1,3}(?:[ .,]\d{3})+|\d{1,7})(?![\dOo]|[.,][\dOo])/
  for (const line of lines) {
    const m = pattern.exec(line.text)
    if (!m) continue
    const at = m.index + m[0].length - m[1].length
    return { value: Number(m[1].replace(/[ .,]/g, '')), confidence: confidenceOf(line, at, m.index + m[0].length) }
  }
  return null
}

/** Reads an invoice's lines into a proposal. `today` bounds the date. */
export function parseInvoice(ocrLines: OcrLine[], today: Date = new Date()): InvoiceProposal {
  const lines = mergeSplitRows(ocrLines).map(indexLine).filter((l) => l.text.trim() !== '')

  const proposal: InvoiceProposal = {
    date: field(readDate(lines, today, { prefer: /\bDATA\b|\bDIN\b|FACTURA/, skip: /SCADEN|TERMEN/ })),
    workshop: field(readWorkshop(lines), (v) => v.replace(/[^\p{L}]/gu, '').length >= 3),
    invoiceNumber: field(readInvoiceNumber(lines)),
    km: field(readKm(lines), (v) => v >= 1 && v <= MAX_KM),
    partsRon: missing(),
    labourRon: missing(),
    totalRon: field(readAmountToPay(lines), (v) => inRange(v, AMOUNT_RANGE)),
    items: [],
  }

  const toPay = proposal.totalRon.value
  if (toPay === null) {
    if (proposal.totalRon.state === 'unsure') {
      proposal.partsRon = unsure()
      proposal.labourRon = unsure()
    }
    return proposal
  }

  const rows = readRows(lines)
  const paid = rows.length > 0 ? paidPerRow(rows, toPay) : null
  if (paid) {
    proposal.items = rows.map((row, i) => ({
      description: row.description,
      amountRon: round2(paid[i]),
      kind: row.labour ? 'labour' : 'part',
    }))
    const sum = (kind: InvoiceItem['kind']) => round2(proposal.items.filter((it) => it.kind === kind).reduce((a, it) => a + it.amountRon, 0))
    const parts = sum('part')
    const labour = sum('labour')
    proposal.partsRon = parts > 0 ? { value: parts, state: 'read' } : missing()
    proposal.labourRon = labour > 0 ? { value: labour, state: 'read' } : missing()
    return proposal
  }

  // No table that adds up: the footer's own split, if it prints one that does.
  const labourSummary = readSummary(lines, /TOTAL\s*MANOPER|MANOPER\w*\s*TOTAL/)
  const partsSummary = readSummary(lines, /TOTAL\s*(?:PIESE|MATERIALE|PRODUSE)|(?:PIESE|MATERIALE)\s*TOTAL/)
  if (
    labourSummary &&
    partsSummary &&
    labourSummary.confidence >= MIN_CONFIDENCE &&
    partsSummary.confidence >= MIN_CONFIDENCE &&
    Math.abs(labourSummary.value + partsSummary.value - toPay) <= sumTolerance(2)
  ) {
    proposal.partsRon = { value: partsSummary.value, state: 'read' }
    proposal.labourRon = { value: labourSummary.value, state: 'read' }
    return proposal
  }

  proposal.partsRon = unsure()
  proposal.labourRon = unsure()
  return proposal
}

/** Everything a workshop job needs from the invoice, checked. */
export function isInvoiceComplete(p: InvoiceProposal): boolean {
  return p.date.state === 'read' && p.workshop.state === 'read' && (p.partsRon.state === 'read' || p.labourRon.state === 'read')
}

const moneyRead = (p: InvoiceProposal) => (p.partsRon.state === 'read' || p.labourRon.state === 'read' ? 1 : 0)

/**
 * Two readings combined as for receipts: the money (parts, labour, the
 * total and the items behind them) comes whole from one reading — the one
 * whose lines added up — and a field the two read differently is unsure.
 */
export function mergeInvoiceProposals(a: InvoiceProposal, b: InvoiceProposal): InvoiceProposal {
  const money = moneyRead(b) > moneyRead(a) ? b : a
  const merged: InvoiceProposal = {
    date: pickOne(a.date, b.date),
    workshop: pickOne(a.workshop, b.workshop),
    invoiceNumber: pickOne(a.invoiceNumber, b.invoiceNumber),
    km: pickOne(a.km, b.km),
    partsRon: money.partsRon,
    labourRon: money.labourRon,
    totalRon: money.totalRon,
    items: money.items,
  }
  for (const f of ['partsRon', 'labourRon'] as const) {
    if (a[f].state === 'read' && b[f].state === 'read' && a[f].value !== b[f].value) {
      merged[f] = unsure()
      merged.items = []
    }
  }
  return merged
}

/** Whether the scan found anything worth proposing. */
export function invoiceReadAnything(p: InvoiceProposal): boolean {
  return [p.date, p.workshop, p.km, p.partsRon, p.labourRon].some((f) => f.state === 'read')
}
