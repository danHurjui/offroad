import type { Content, TableCell } from 'pdfmake'
import { PDF_COLORS, PDF_PAGE, PDF_TABLE_LAYOUT, pdfRule, pdfStatTile, type PdfDocDefinition } from '@/lib/pdf'
import type { Passport } from '@/lib/passport'
import type { ServiceRow } from '@/lib/serviceBook'

/** Every word the document prints, resolved by the route in the reader's language. */
export interface PdfPassportStrings {
  title: string
  /** What it is — in the heading, not a footnote. */
  what: string
  snapshot: string
  identity: string | null
  tiles: Array<{ label: string; value: string }>
  missingTitle: string
  missing: string[]
  historyTitle: string
  datesRule: string
  columns: { date: string; km: string; work: string; cost: string }
  detail: (row: ServiceRow) => string
  recorded: (row: ServiceRow) => string
  noJobs: string
  documentsTitle: string
  documents: string[]
  tyresLine: string | null
  footer: string
}

const RON = (n: number) => `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} RON`
const DATE = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

/**
 * RL-049: the passport as a PDF — a **snapshot**, dated as one on its face,
 * where the shared link is a live view. The fourth document on the RL-014
 * engine. Its honesty rules live in passport.ts; this only lays them out,
 * and puts "what this is" directly under the title.
 */
export function buildPassportDocDefinition(passport: Passport, strings: PdfPassportStrings): PdfDocDefinition {
  const content: Content[] = [
    {
      columns: [
        { text: 'RigLog', style: 'brand', width: '*' },
        { text: strings.title, style: 'brandSubtitle', width: 'auto' },
      ],
    },
    pdfRule(PDF_COLORS.brand, 4, 14),
    { text: passport.name, style: 'title' },
    { text: strings.what, style: 'what' },
    ...(strings.identity ? [{ text: strings.identity, style: 'identity' }] : []),
    { text: strings.snapshot, style: 'snapshot' },
    { columns: strings.tiles.map((tile, i) => pdfStatTile(tile.label, tile.value, i === strings.tiles.length - 1 ? '*' : 130)), margin: [0, 10, 0, 6] },
    pdfRule(PDF_COLORS.rule, 8, 10),
    { text: strings.missingTitle, style: 'h2' },
    { ul: strings.missing, style: 'list' },
    { text: strings.historyTitle, style: 'h2' },
    { text: strings.datesRule, style: 'note' },
  ]

  if (passport.jobs.rows.length === 0) {
    content.push({ text: strings.noJobs, style: 'note' })
  } else {
    const body: TableCell[][] = [
      [
        { text: strings.columns.date, style: 'th' },
        { text: strings.columns.km, style: 'th', alignment: 'right' },
        { text: strings.columns.work, style: 'th' },
        { text: strings.columns.cost, style: 'th', alignment: 'right' },
      ],
    ]
    for (const row of passport.jobs.rows) {
      body.push([
        { text: DATE(row.date), style: 'cell' },
        { text: row.km !== null ? row.km.toLocaleString('ro-RO') : '—', style: 'cell', alignment: 'right' },
        {
          stack: [
            { text: row.name, style: 'workName' },
            { text: strings.detail(row), style: 'workDetail' },
            { text: strings.recorded(row), style: 'workNote' },
          ],
        },
        { text: passport.jobs.spend !== null && row.cost > 0 ? RON(row.cost) : '—', style: 'cell', alignment: 'right' },
      ])
    }
    content.push({ table: { headerRows: 1, widths: [58, 58, '*', 70], body, dontBreakRows: true }, layout: PDF_TABLE_LAYOUT, margin: [0, 4, 0, 0] })
  }

  content.push({ text: strings.documentsTitle, style: 'h2' })
  content.push({ ul: strings.documents, style: 'list' })
  if (strings.tyresLine) content.push({ text: strings.tyresLine, style: 'list', margin: [0, 6, 0, 0] })

  return {
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: strings.footer, style: 'footer', width: '*' },
        { text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right', width: 40 },
      ],
      margin: [PDF_PAGE.marginX, 0, PDF_PAGE.marginX, 0],
    }),
    styles: {
      brand: { fontSize: 12, bold: true, color: PDF_COLORS.brand, characterSpacing: 0.6 },
      brandSubtitle: { fontSize: 9, color: PDF_COLORS.inkMuted, margin: [0, 3, 0, 0] },
      title: { fontSize: 22, bold: true, color: PDF_COLORS.ink, margin: [0, 0, 0, 4] },
      what: { fontSize: 10, bold: true, color: PDF_COLORS.ink, margin: [0, 2, 0, 4] },
      identity: { fontSize: 9, color: PDF_COLORS.ink, margin: [0, 2, 0, 0] },
      snapshot: { fontSize: 8.5, color: PDF_COLORS.inkMuted, margin: [0, 2, 0, 0] },
      h2: { fontSize: 11, bold: true, color: PDF_COLORS.ink, margin: [0, 12, 0, 4] },
      list: { fontSize: 9, color: PDF_COLORS.ink },
      note: { fontSize: 8, italics: true, color: PDF_COLORS.inkMuted, margin: [0, 0, 0, 4] },
      th: { fontSize: 7.5, bold: true, color: PDF_COLORS.inkMuted, characterSpacing: 0.3 },
      cell: { fontSize: 9, color: PDF_COLORS.ink },
      workName: { fontSize: 9.5, bold: true, color: PDF_COLORS.ink },
      workDetail: { fontSize: 8, color: PDF_COLORS.inkMuted, margin: [0, 1, 0, 0] },
      workNote: { fontSize: 7.5, italics: true, color: PDF_COLORS.inkMuted, margin: [0, 1, 0, 0] },
      footer: { fontSize: 7, color: PDF_COLORS.inkFaint },
    },
  }
}
