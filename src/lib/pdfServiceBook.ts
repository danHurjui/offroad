import type { Content, TableCell } from 'pdfmake'
import { PDF_COLORS, PDF_PAGE, PDF_TABLE_LAYOUT, pdfRule, pdfStatTile, type PdfDocDefinition } from '@/lib/pdf'
import type { ServiceRow } from '@/lib/serviceBook'

/** The words this document prints, resolved by the route in the reader's language. */
export interface PdfServiceBookStrings {
  title: string
  entries: string
  total: string
  generated: string
  columns: { date: string; km: string; work: string; cost: string }
  /** What the document is — a record kept by the owner, not a certificate. */
  provenance: string
  noEntries: string
  documentedWith: string
  /** One line under the job's name: category, parts, workshop. */
  detail: (row: ServiceRow) => string
  /** The row's flags and attachments, already worded; empty for none. */
  notes: (row: ServiceRow) => string
}

export interface ServiceBookInput {
  strings: PdfServiceBookStrings
  vehicleName: string
  rows: ServiceRow[]
  total: number
  generatedAt: Date
}

const RON = (n: number) => `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} RON`
const DATE = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

/**
 * RL-047: the service book as a PDF — the third document on the RL-014
 * engine, beside the build history and the job report, and deliberately
 * the plainest of the three: a ledger a buyer or a workshop reads down,
 * no photos. It says on its face that the owner kept it; RigLog records
 * what it is told and certifies nothing (the same rule RL-049's passport
 * will lean on harder).
 */
export function buildServiceBookDocDefinition(input: ServiceBookInput): PdfDocDefinition {
  const { strings } = input

  const header: TableCell[] = [
    { text: strings.columns.date, style: 'th' },
    { text: strings.columns.km, style: 'th', alignment: 'right' },
    { text: strings.columns.work, style: 'th' },
    { text: strings.columns.cost, style: 'th', alignment: 'right' },
  ]
  const body: TableCell[][] = [header]
  for (const row of input.rows) {
    const notes = strings.notes(row)
    body.push([
      { text: DATE(row.date), style: 'cell' },
      { text: row.km !== null ? row.km.toLocaleString('ro-RO') : '—', style: 'cell', alignment: 'right' },
      {
        stack: [
          { text: row.name, style: 'workName' },
          { text: strings.detail(row), style: 'workDetail' },
          ...(notes ? [{ text: notes, style: 'workNote' }] : []),
        ],
      },
      { text: row.cost > 0 ? RON(row.cost) : '—', style: 'cell', alignment: 'right' },
    ])
  }

  const content: Content[] = [
    {
      columns: [
        { text: 'RigLog', style: 'brand', width: '*' },
        { text: strings.title, style: 'brandSubtitle', width: 'auto' },
      ],
    },
    pdfRule(PDF_COLORS.brand, 4, 14),
    { text: input.vehicleName, style: 'title' },
    { text: strings.provenance, style: 'provenance' },
    {
      columns: [
        pdfStatTile(strings.entries, String(input.rows.length), 120),
        pdfStatTile(strings.total, RON(input.total), 160),
        pdfStatTile(strings.generated, DATE(input.generatedAt), '*'),
      ],
      margin: [0, 10, 0, 6],
    },
    pdfRule(PDF_COLORS.rule, 8, 10),
  ]

  if (input.rows.length === 0) {
    content.push({ text: strings.noEntries, style: 'workNote' })
  } else {
    content.push({
      table: { headerRows: 1, widths: [58, 58, '*', 70], body, dontBreakRows: true },
      layout: PDF_TABLE_LAYOUT,
    })
  }

  return {
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: strings.documentedWith, style: 'footer' },
        { text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right' },
      ],
      margin: [PDF_PAGE.marginX, 0, PDF_PAGE.marginX, 0],
    }),
    styles: {
      brand: { fontSize: 12, bold: true, color: PDF_COLORS.brand, characterSpacing: 0.6 },
      brandSubtitle: { fontSize: 9, color: PDF_COLORS.inkMuted, margin: [0, 3, 0, 0] },
      title: { fontSize: 22, bold: true, color: PDF_COLORS.ink, margin: [0, 0, 0, 4] },
      provenance: { fontSize: 8.5, color: PDF_COLORS.inkMuted },
      th: { fontSize: 7.5, bold: true, color: PDF_COLORS.inkMuted, characterSpacing: 0.3 },
      cell: { fontSize: 9, color: PDF_COLORS.ink },
      workName: { fontSize: 9.5, bold: true, color: PDF_COLORS.ink },
      workDetail: { fontSize: 8, color: PDF_COLORS.inkMuted, margin: [0, 1, 0, 0] },
      workNote: { fontSize: 7.5, italics: true, color: PDF_COLORS.inkMuted, margin: [0, 1, 0, 0] },
      footer: { fontSize: 7.5, color: PDF_COLORS.inkFaint },
    },
  }
}
