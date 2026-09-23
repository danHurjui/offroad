import type { Content, TableCell } from 'pdfmake'
import { PDF_COLORS, PDF_PAGE, PDF_TABLE_LAYOUT, pdfRule, pdfStatTile, type PdfDocDefinition, type PdfTableLayout } from '@/lib/pdf'
import { formatRon } from '@/lib/money'

/** One line of the spend-per-vehicle table, already worded. */
export interface FleetReportVehicleLine {
  name: string
  detail: string
  drivers: string
  lines: number
  running: number
  total: number
}

/** The words this document prints, resolved by the route in the reader's language. */
export interface PdfFleetReportStrings {
  title: string
  period: string
  generated: string
  tiles: { vehicles: string; running: string; total: string; jobs: string }
  byVehicle: string
  byVehicleColumns: { vehicle: string; drivers: string; lines: string; running: string; total: string }
  byCategory: string
  byCategoryColumns: { category: string; lines: string; total: string }
  compliance: string
  expiries: string
  expiryColumns: { vehicle: string; document: string; date: string; outcome: string }
  renewals: string
  renewalColumns: { vehicle: string; document: string; date: string; previous: string; next: string }
  noCosts: string
  noExpiries: string
  noRenewals: string
  /** How renewals are known — only from when RigLog began recording them. */
  renewalsNote: string
  /** What the figures are: what was recorded, nothing estimated. */
  footnote: string
  footer: string
}

export interface FleetReportInput {
  strings: PdfFleetReportStrings
  organizationName: string
  vehicles: FleetReportVehicleLine[]
  categories: Array<{ label: string; lines: number; total: number }>
  expiries: Array<{ vehicle: string; document: string; date: string; outcome: string }>
  renewals: Array<{ vehicle: string; document: string; date: string; previous: string; next: string }>
  total: number
  running: number
  jobs: number
}

/** The shared layout draws a heavier rule above a totals row; a list without one gets hairlines only. */
const LIST_LAYOUT: PdfTableLayout = {
  ...PDF_TABLE_LAYOUT,
  hLineWidth: (rowIndex, node) => (rowIndex === 1 ? 0.75 : rowIndex === 0 || rowIndex === node.table.body.length ? 0 : 0.5),
}

const th = (text: string, alignment?: 'right'): TableCell => ({ text, style: 'th', ...(alignment ? { alignment } : {}) })
const cell = (text: string, alignment?: 'right'): TableCell => ({ text, style: 'cell', ...(alignment ? { alignment } : {}) })

/**
 * RL-041: the fleet summary for one period — spend per vehicle (with who
 * drove it), spend per category, and what expired and was renewed. The
 * fifth document on the RL-014 engine, and a ledger like the service book:
 * no photos, figures in ink so it survives a greyscale printer.
 */
export function buildFleetReportDocDefinition(input: FleetReportInput): PdfDocDefinition {
  const { strings } = input

  const content: Content[] = [
    {
      columns: [
        { text: 'RigLog', style: 'brand', width: '*' },
        { text: strings.title, style: 'brandSubtitle', width: 'auto' },
      ],
    },
    pdfRule(PDF_COLORS.brand, 4, 14),
    { text: input.organizationName, style: 'title' },
    { text: strings.period, style: 'subtitle' },
    {
      columns: [
        pdfStatTile(strings.tiles.vehicles, String(input.vehicles.length), 90),
        pdfStatTile(strings.tiles.jobs, String(input.jobs), 90),
        pdfStatTile(strings.tiles.running, formatRon(input.running), 150),
        pdfStatTile(strings.tiles.total, formatRon(input.total), '*'),
      ],
      margin: [0, 10, 0, 6],
    },
    { text: strings.generated, style: 'note' },
    pdfRule(PDF_COLORS.rule, 8, 10),
    { text: strings.byVehicle, style: 'h2' },
  ]

  const c = strings.byVehicleColumns
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 110, 36, 72, 72],
      dontBreakRows: true,
      body: [
        [th(c.vehicle), th(c.drivers), th(c.lines, 'right'), th(c.running, 'right'), th(c.total, 'right')],
        ...input.vehicles.map((v): TableCell[] => [
          { stack: [{ text: v.name, style: 'rowName' }, { text: v.detail, style: 'rowDetail' }] },
          cell(v.drivers),
          cell(String(v.lines), 'right'),
          cell(formatRon(v.running), 'right'),
          cell(formatRon(v.total), 'right'),
        ]),
        [{ text: '', style: 'cell' }, cell(''), cell(''), { text: formatRon(input.running), style: 'total', alignment: 'right' }, { text: formatRon(input.total), style: 'total', alignment: 'right' }],
      ],
    },
    layout: PDF_TABLE_LAYOUT,
  })

  content.push({ text: strings.byCategory, style: 'h2' })
  if (input.categories.length === 0) {
    content.push({ text: strings.noCosts, style: 'note' })
  } else {
    const k = strings.byCategoryColumns
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 50, 90],
        body: [
          [th(k.category), th(k.lines, 'right'), th(k.total, 'right')],
          ...input.categories.map((row): TableCell[] => [cell(row.label), cell(String(row.lines), 'right'), cell(formatRon(row.total), 'right')]),
          [cell(''), cell(''), { text: formatRon(input.total), style: 'total', alignment: 'right' }],
        ],
      },
      layout: PDF_TABLE_LAYOUT,
    })
  }

  content.push({ text: strings.compliance, style: 'h2' }, { text: strings.expiries, style: 'h3' })
  if (input.expiries.length === 0) {
    content.push({ text: strings.noExpiries, style: 'note' })
  } else {
    const e = strings.expiryColumns
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 80, 62, 150],
        dontBreakRows: true,
        body: [
          [th(e.vehicle), th(e.document), th(e.date), th(e.outcome)],
          ...input.expiries.map((row): TableCell[] => [cell(row.vehicle), cell(row.document), cell(row.date), cell(row.outcome)]),
        ],
      },
      layout: LIST_LAYOUT,
    })
  }

  content.push({ text: strings.renewals, style: 'h3' })
  if (input.renewals.length === 0) {
    content.push({ text: strings.noRenewals, style: 'note' })
  } else {
    const r = strings.renewalColumns
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 80, 62, 70, 70],
        dontBreakRows: true,
        body: [
          [th(r.vehicle), th(r.document), th(r.date), th(r.previous), th(r.next)],
          ...input.renewals.map((row): TableCell[] => [cell(row.vehicle), cell(row.document), cell(row.date), cell(row.previous), cell(row.next)]),
        ],
      },
      layout: LIST_LAYOUT,
    })
  }
  content.push({ text: strings.renewalsNote, style: 'note', margin: [0, 6, 0, 0] })
  content.push(pdfRule(PDF_COLORS.rule, 14, 6), { text: strings.footnote, style: 'note' })

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
      title: { fontSize: 22, bold: true, color: PDF_COLORS.ink, margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 10, color: PDF_COLORS.inkMuted },
      h2: { fontSize: 12, bold: true, color: PDF_COLORS.ink, margin: [0, 16, 0, 6] },
      h3: { fontSize: 9.5, bold: true, color: PDF_COLORS.inkMuted, margin: [0, 8, 0, 4] },
      th: { fontSize: 7.5, bold: true, color: PDF_COLORS.inkMuted, characterSpacing: 0.3 },
      cell: { fontSize: 9, color: PDF_COLORS.ink },
      total: { fontSize: 9, bold: true, color: PDF_COLORS.ink },
      rowName: { fontSize: 9.5, bold: true, color: PDF_COLORS.ink },
      rowDetail: { fontSize: 8, color: PDF_COLORS.inkMuted, margin: [0, 1, 0, 0] },
      note: { fontSize: 8, italics: true, color: PDF_COLORS.inkMuted },
      footer: { fontSize: 7.5, color: PDF_COLORS.inkFaint },
    },
  }
}
