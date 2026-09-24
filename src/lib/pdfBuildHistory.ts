import type { Content } from 'pdfmake'
import { PDF_COLORS, PDF_PAGE, PDF_TABLE_LAYOUT, pdfRule, pdfStatTile, type PdfDocDefinition, type PdfPhoto } from '@/lib/pdf'
import type { ProjectType } from '@/lib/projectType'
import { formatRon } from './money'

export type PdfTaskPhoto = PdfPhoto

/**
 * The words this document prints, resolved by the caller.
 *
 * The builder stays pure — no I/O, no request context, no translator —
 * which is what makes it unit-testable. The route handler holds the
 * request and therefore the reader's language, so it looks the labels up
 * and passes them in. The reader here is whoever pressed Export, so it is
 * the browser's language rather than an account column.
 */
export interface PdfHistoryStrings {
  subtitle: string
  generation: string
  engine: string
  vin: string
  foundState: string
  acquired: string
  purchasePrice: string
  odometer: string
  condition: string
  workshop: string
  diy: string
  generatedOn: string

  /** Stat-tile labels. The figures themselves are built by the caller so
   *  the number formatting stays in one place with the rest of the app. */
  progressLabel: string
  totalSpentLabel: string
  jobsLoggedLabel: string
  periodLabel: string

  /** The expense report. */
  expenses: string
  byCategory: string
  everyExpense: string
  colDate: string
  colItem: string
  colCategory: string
  colType: string
  colAmount: string
  total: string
  noExpenses: string
}

export interface PdfTask {
  name: string
  brand: string | null
  statusLabel: string
  workType: 'DIY' | 'WORKSHOP'
  date: Date
  totalCost: number
  workshopName: string | null
  notes: string | null
  photos: PdfTaskPhoto[]
}

export interface PdfTaskCategory {
  categoryLabel: string
  tasks: PdfTask[]
}

export interface PdfFoundState {
  acquisitionDate: Date | null
  purchasePriceRon: number | null
  odometer: number | null
  knownHistory: string | null
  conditionRating: number | null
  photos: PdfTaskPhoto[]
}

export interface VehicleHistoryPdfInput {
  strings: PdfHistoryStrings
  vehicleName: string
  projectType: ProjectType
  generation: string | null
  engine: string | null
  vin: string | null
  coverPhotoDataUri: string | null
  progressLabel: string
  progressPct: number
  totalSpent: number
  categories: PdfTaskCategory[]
  foundState: PdfFoundState | null
  generatedAt: Date
}

const RON = (n: number) => formatRon(n)
const DATE = (d: Date) => d.toLocaleDateString('ro-RO')

type Margin = [number, number, number, number]

function photoRow(photos: PdfTaskPhoto[]): Content | null {
  if (photos.length === 0) return null
  return {
    columns: photos.map((p) => ({ image: p.dataUri, width: 140, margin: [0, 4, 8, 0] as Margin })),
    columnGap: 0,
  }
}

function taskBlock(task: PdfTask, strings: PdfHistoryStrings): Content {
  const content: Content[] = [
    {
      columns: [
        { text: task.brand ? `${task.name} — ${task.brand}` : task.name, style: 'taskName', width: '*' },
        { text: RON(task.totalCost), style: 'taskCost', width: 'auto' },
      ],
    },
    {
      text: [
        `${DATE(task.date)}  ·  ${task.statusLabel}  ·  ${task.workType === 'WORKSHOP' ? strings.workshop : strings.diy}`,
        task.workshopName ? `  ·  ${task.workshopName}` : '',
      ].join(''),
      style: 'taskMeta',
    },
  ]
  if (task.notes) content.push({ text: task.notes, style: 'taskNotes' })
  const photos = photoRow(task.photos)
  if (photos) content.push(photos)
  // Kept on one page where it fits: a job split across a page break reads
  // as two half-jobs, and these blocks are short.
  return { stack: content, style: 'taskBlock', unbreakable: true }
}

function detailTable(rows: [string, string][]): Content {
  return {
    table: { widths: ['auto', '*'], body: rows.map(([k, v]) => [{ text: k, style: 'detailKey' }, { text: v, style: 'detailValue' }]) },
    layout: 'noBorders',
    margin: [0, 0, 0, 10],
  }
}

function sectionHeader(text: string, pageBreak = false): Content {
  return {
    // Kept with the rule under it, and with breathing room above so a
    // header does not sit on top of the block it follows.
    unbreakable: true,
    margin: [0, pageBreak ? 0 : 10, 0, 0] as Margin,
    stack: [
      { text, style: 'sectionHeader' },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 46, y2: 0, lineWidth: 2, lineColor: PDF_COLORS.brand },
        ],
        margin: [0, 3, 0, 10] as Margin,
      },
    ],
    ...(pageBreak ? { pageBreak: 'before' as const } : {}),
  }
}

/** One expense line, flattened out of the per-category grouping. */
interface ExpenseLine {
  date: Date
  name: string
  categoryLabel: string
  workType: 'DIY' | 'WORKSHOP'
  amount: number
}

function expenseLines(categories: PdfTaskCategory[]): ExpenseLine[] {
  return categories
    .flatMap((category) =>
      category.tasks.map((task) => ({
        date: task.date,
        name: task.name,
        categoryLabel: category.categoryLabel,
        workType: task.workType,
        amount: task.totalCost,
      }))
    )
    // Oldest first: an expense report is read as a ledger, and a ledger
    // runs forwards. The build sections above are grouped by category
    // instead, which is the other question the same data answers.
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Per-category totals with a proportion bar.
 *
 * A bar rather than a pie, and beside the figure rather than instead of
 * it: the number is what an expense report is for, and the bar only says
 * at a glance which categories dominate. One hue, varying length — this is
 * magnitude, not identity, so nothing here encodes a category *by colour*
 * and the page survives being printed in greyscale.
 */
function categoryTotalsTable(lines: ExpenseLine[]): Content {
  const totals = new Map<string, number>()
  for (const line of lines) totals.set(line.categoryLabel, (totals.get(line.categoryLabel) ?? 0) + line.amount)

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const max = rows[0]?.[1] ?? 0
  const BAR_WIDTH = 110

  return {
    table: {
      // Label, then its bar, then the figure. The bar sat against the
      // right-hand column before, a hand's width from the thing it
      // measured.
      widths: [150, BAR_WIDTH, '*'],
      body: rows.map(([label, total]) => [
        { text: label, style: 'tableCell' },
        {
          // Zero-width canvases are illegal in pdfmake, and a category can
          // legitimately total zero.
          canvas:
            max > 0 && total > 0
              ? [
                  {
                    type: 'rect' as const,
                    x: 0,
                    y: 2,
                    w: Math.max(2, (total / max) * BAR_WIDTH),
                    h: 6,
                    r: 1,
                    color: PDF_COLORS.brand,
                  },
                ]
              : [],
          margin: [0, 1, 0, 0] as Margin,
        },
        { text: RON(total), style: 'tableCellNum' },
      ]),
    },
    layout: {
      ...PDF_TABLE_LAYOUT,
      // No heavier rule here: this table has no header row and no total,
      // so every line is the same kind of line.
      hLineWidth: (rowIndex, node) => (rowIndex === 0 || rowIndex === node.table.body.length ? 0 : 0.5),
    },
    margin: [0, 0, 0, 14],
  }
}

/** The ledger: every expense, with its date. */
function expenseTable(lines: ExpenseLine[], strings: PdfHistoryStrings): Content {
  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return {
    table: {
      headerRows: 1,
      // Date and amount take what they need; the job name gets the rest.
      widths: [52, '*', 92, 52, 62],
      body: [
        [
          { text: strings.colDate, style: 'tableHead' },
          { text: strings.colItem, style: 'tableHead' },
          { text: strings.colCategory, style: 'tableHead' },
          { text: strings.colType, style: 'tableHead' },
          { text: strings.colAmount, style: 'tableHeadNum' },
        ],
        ...lines.map((line) => [
          { text: DATE(line.date), style: 'tableCellMuted' },
          { text: line.name, style: 'tableCell' },
          { text: line.categoryLabel, style: 'tableCellMuted' },
          { text: line.workType === 'WORKSHOP' ? strings.workshop : strings.diy, style: 'tableCellMuted' },
          { text: RON(line.amount), style: 'tableCellNum' },
        ]),
        [
          { text: strings.total, style: 'tableTotal', colSpan: 4 },
          {},
          {},
          {},
          { text: RON(total), style: 'tableTotalNum' },
        ],
      ],
    },
    layout: PDF_TABLE_LAYOUT,
  }
}

/**
 * RL-014: pure pdfmake document-definition builder — no I/O. The route
 * handler (src/app/api/vehicles/[id]/export/pdf/route.ts) is responsible
 * for fetching the vehicle/tasks/photos and resolving photo storage paths
 * to data: URIs (src/lib/pdf.ts's resolveImageDataUri) before calling this.
 */
export function buildVehicleHistoryDocDefinition(input: VehicleHistoryPdfInput): PdfDocDefinition {
  const { strings } = input
  const lines = expenseLines(input.categories)
  const jobCount = lines.length
  const first = lines[0]?.date
  const last = lines[lines.length - 1]?.date
  const period = first && last ? (jobCount === 1 ? DATE(first) : `${DATE(first)} – ${DATE(last)}`) : '—'

  const content: Content[] = [
    // The masthead. Nothing in the old document said which product made
    // it, which matters for a page that gets printed and handed to a buyer.
    {
      columns: [
        { text: 'RigLog', style: 'brand', width: '*' },
        { text: strings.subtitle, style: 'brandSubtitle', width: 'auto' },
      ],
    },
    pdfRule(PDF_COLORS.brand, 4, 14),
    { text: input.vehicleName, style: 'title' },
  ]

  if (input.coverPhotoDataUri) {
    // Full text-column width: the cover was 300pt in a 515pt column, which
    // left it looking like a thumbnail that had failed to load.
    content.push({ image: input.coverPhotoDataUri, width: PDF_PAGE.contentWidth, margin: [0, 10, 0, 12] })
  }

  // The figures, before any of the detail.
  content.push({
    columns: [
      pdfStatTile(strings.progressLabel, `${input.progressPct}%`, 110),
      pdfStatTile(strings.totalSpentLabel, RON(input.totalSpent), 150),
      pdfStatTile(strings.jobsLoggedLabel, String(jobCount), 90),
      pdfStatTile(strings.periodLabel, period, '*'),
    ],
    margin: [0, 6, 0, 8] as Margin,
  })

  // A progress bar only where the mode has an end state to progress
  // towards — a daily driver's log just accumulates, so a percentage of it
  // would mean nothing (see config.tracksCompletion).
  if (input.projectType !== 'DAILY_DRIVER') {
    content.push({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: PDF_PAGE.contentWidth, h: 5, r: 2.5, color: PDF_COLORS.brandTint },
        ...(input.progressPct > 0
          ? [
              {
                type: 'rect' as const,
                x: 0,
                y: 0,
                w: Math.max(3, (Math.min(input.progressPct, 100) / 100) * PDF_PAGE.contentWidth),
                h: 5,
                r: 2.5,
                color: PDF_COLORS.brand,
              },
            ]
          : []),
      ],
      margin: [0, 0, 0, 14] as Margin,
    })
  }

  const details: [string, string][] = []
  if (input.generation) details.push([strings.generation, input.generation])
  if (input.engine) details.push([strings.engine, input.engine])
  if (input.vin) details.push([strings.vin, input.vin])
  if (details.length > 0) content.push(detailTable(details))

  if (input.foundState) {
    const fs = input.foundState
    content.push(sectionHeader(strings.foundState))
    const rows: [string, string][] = fs.acquisitionDate ? [[strings.acquired, DATE(fs.acquisitionDate)]] : []
    if (fs.purchasePriceRon != null) rows.push([strings.purchasePrice, RON(fs.purchasePriceRon)])
    if (fs.odometer != null) rows.push([strings.odometer, `${fs.odometer.toLocaleString('ro-RO')} km`])
    if (fs.conditionRating != null) rows.push([strings.condition, `${fs.conditionRating}/5`])
    content.push(detailTable(rows))
    if (fs.knownHistory) content.push({ text: fs.knownHistory, style: 'taskNotes', margin: [0, 0, 0, 6] })
    const fsPhotos = photoRow(fs.photos)
    if (fsPhotos) content.push(fsPhotos)
    content.push({ text: '', margin: [0, 0, 0, 10] })
  }

  // The expense report, on its own page: it is the part people print on
  // its own, to settle up or to hand over with the vehicle.
  content.push(sectionHeader(strings.expenses, true))
  if (lines.length === 0) {
    content.push({ text: strings.noExpenses, style: 'taskNotes' })
  } else {
    content.push({ text: strings.byCategory, style: 'subsectionHeader' })
    content.push(categoryTotalsTable(lines))
    content.push({ text: strings.everyExpense, style: 'subsectionHeader' })
    content.push(expenseTable(lines, strings))
  }

  let firstSection = true
  for (const category of input.categories) {
    if (category.tasks.length === 0) continue
    // Only the first build section starts a page. Every category used to,
    // which spread six jobs over four pages that were mostly white.
    content.push(sectionHeader(category.categoryLabel, firstSection))
    firstSection = false
    for (const task of category.tasks) content.push(taskBlock(task, strings))
  }

  return {
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: strings.generatedOn, style: 'footer' },
        { text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right' },
      ],
      margin: [PDF_PAGE.marginX, 0, PDF_PAGE.marginX, 0],
    }),
    styles: {
      brand: { fontSize: 12, bold: true, color: PDF_COLORS.brand, characterSpacing: 0.6 },
      brandSubtitle: { fontSize: 9, color: PDF_COLORS.inkMuted, margin: [0, 3, 0, 0] },
      title: { fontSize: 22, bold: true, color: PDF_COLORS.ink, margin: [0, 0, 0, 2] },
      sectionHeader: { fontSize: 13, bold: true, color: PDF_COLORS.ink },
      subsectionHeader: { fontSize: 9, bold: true, color: PDF_COLORS.inkMuted, characterSpacing: 0.4, margin: [0, 2, 0, 6] },
      detailKey: { fontSize: 9, color: PDF_COLORS.inkMuted },
      detailValue: { fontSize: 9, color: PDF_COLORS.ink },
      tableHead: { fontSize: 7.5, bold: true, color: PDF_COLORS.inkMuted, characterSpacing: 0.4 },
      tableHeadNum: { fontSize: 7.5, bold: true, color: PDF_COLORS.inkMuted, characterSpacing: 0.4, alignment: 'right' },
      tableCell: { fontSize: 9, color: PDF_COLORS.ink },
      tableCellMuted: { fontSize: 8.5, color: PDF_COLORS.inkMuted },
      tableCellNum: { fontSize: 9, color: PDF_COLORS.ink, alignment: 'right' },
      tableTotal: { fontSize: 9, bold: true, color: PDF_COLORS.ink },
      tableTotalNum: { fontSize: 10, bold: true, color: PDF_COLORS.ink, alignment: 'right' },
      taskBlock: { margin: [0, 0, 0, 12] },
      taskName: { fontSize: 10.5, bold: true, color: PDF_COLORS.ink },
      taskCost: { fontSize: 10.5, bold: true, color: PDF_COLORS.ink, alignment: 'right' },
      taskMeta: { fontSize: 8, color: PDF_COLORS.inkMuted, margin: [0, 2, 0, 2] },
      taskNotes: { fontSize: 9, italics: true, color: PDF_COLORS.inkMuted, margin: [0, 2, 0, 2] },
      footer: { fontSize: 7.5, color: PDF_COLORS.inkFaint },
    },
  }
}
