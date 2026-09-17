import type { Content } from 'pdfmake'
import { PDF_COLORS, PDF_PAGE, pdfRule, pdfStatTile, type PdfDocDefinition, type PdfPhoto } from '@/lib/pdf'

export interface JobReportTask {
  name: string
  category: string
  date: Date
  workType: 'DIY' | 'WORKSHOP'
  partsCostRon: number
  labourCostRon: number
  photos: PdfPhoto[]
}

/** The words this document prints; see PdfHistoryStrings for why. */
export interface PdfJobReportStrings {
  title: string
  preparedBy: string
  period: string
  /**
   * Given the total, produce the line. The builder still does the summing
   * — it is a pure function of the tasks it was handed, and moving it out
   * would put the same loop in every caller.
   */
  totalLabour: (total: number) => string
  totalParts: (total: number) => string
  noTasks: string
  documentedWith: string
  /** `taskMeta(task)` — one line per task, already formatted. */
  taskMeta: (task: { date: Date; category: string; partsCostRon: number; labourCostRon: number }) => string
}

export interface JobReportInput {
  strings: PdfJobReportStrings
  collaboratorName: string
  vehicleName: string
  rangeLabel: string
  tasks: JobReportTask[]
  generatedAt: Date
}

const RON = (n: number) => `${n.toLocaleString('ro-RO')} RON`

function photoRow(photos: PdfPhoto[]): Content | null {
  if (photos.length === 0) return null
  return {
    columns: photos.map((p) => ({ image: p.dataUri, width: 140, margin: [0, 4, 8, 0] as [number, number, number, number] })),
    columnGap: 0,
  }
}

function taskRow(strings: PdfJobReportStrings, task: JobReportTask): Content {
  const totalCost = task.partsCostRon + task.labourCostRon
  const content: Content[] = [
    {
      columns: [
        { text: task.name, style: 'taskName', width: '*' },
        { text: RON(totalCost), style: 'taskCost', width: 'auto' },
      ],
    },
    {
      text: strings.taskMeta(task),
      style: 'taskMeta',
    },
  ]
  const photos = photoRow(task.photos)
  if (photos) content.push(photos)
  return { stack: content, style: 'taskBlock', unbreakable: true }
}

/**
 * RL-033: job report — a collaborator's summary of work done on a
 * project, for the owner. Reuses RL-014's PDF engine (src/lib/pdf.ts) but
 * is its own document (different scope, always-free branding footer) since
 * a job report and the owner's full build history serve different
 * audiences and must never be paywalled the same way.
 */
export function buildJobReportDocDefinition(input: JobReportInput): PdfDocDefinition {
  const totalLabourCost = input.tasks.reduce((sum, t) => sum + t.labourCostRon, 0)
  const totalPartsCost = input.tasks.reduce((sum, t) => sum + t.partsCostRon, 0)

  const { strings } = input
  // The same masthead, rule and tokens as the build history: two documents
  // from one product should not look like two products.
  const content: Content[] = [
    {
      columns: [
        { text: 'RigLog', style: 'brand', width: '*' },
        { text: strings.title, style: 'brandSubtitle', width: 'auto' },
      ],
    },
    pdfRule(PDF_COLORS.brand, 4, 14),
    { text: input.vehicleName, style: 'title' },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          [{ text: strings.preparedBy, style: 'detailKey' }, { text: input.collaboratorName, style: 'detailValue' }],
          [{ text: strings.period, style: 'detailKey' }, { text: input.rangeLabel, style: 'detailValue' }],
        ],
      },
      layout: 'noBorders',
      margin: [0, 6, 0, 12],
    },
    {
      // The two figures this document exists to communicate, set as
      // figures rather than as two bold sentences facing each other.
      columns: [
        pdfStatTile(strings.totalLabour(totalLabourCost), RON(totalLabourCost), 180),
        pdfStatTile(strings.totalParts(totalPartsCost), RON(totalPartsCost), '*'),
      ],
      margin: [0, 0, 0, 6],
    },
    pdfRule(PDF_COLORS.rule, 8, 14),
  ]

  if (input.tasks.length === 0) {
    content.push({ text: strings.noTasks, style: 'taskNotes' })
  } else {
    for (const task of input.tasks) content.push(taskRow(strings, task))
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
      title: { fontSize: 22, bold: true, color: PDF_COLORS.ink, margin: [0, 0, 0, 2] },
      detailKey: { fontSize: 9, color: PDF_COLORS.inkMuted },
      detailValue: { fontSize: 9, color: PDF_COLORS.ink },
      taskBlock: { margin: [0, 0, 0, 12] },
      taskName: { fontSize: 10.5, bold: true, color: PDF_COLORS.ink },
      taskCost: { fontSize: 10.5, bold: true, color: PDF_COLORS.ink, alignment: 'right' },
      taskMeta: { fontSize: 8, color: PDF_COLORS.inkMuted, margin: [0, 2, 0, 2] },
      taskNotes: { fontSize: 9, italics: true, color: PDF_COLORS.inkMuted },
      footer: { fontSize: 7.5, color: PDF_COLORS.inkFaint },
    },
  }
}
