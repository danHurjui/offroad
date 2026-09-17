import type { Content } from 'pdfmake'
import type { PdfDocDefinition, PdfPhoto } from '@/lib/pdf'

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
  return { stack: content, style: 'taskBlock' }
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
  const content: Content[] = [
    { text: strings.title, style: 'title' },
    { text: input.vehicleName, style: 'subtitle' },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          [{ text: strings.preparedBy, style: 'detailKey' }, { text: input.collaboratorName, style: 'detailValue' }],
          [{ text: strings.period, style: 'detailKey' }, { text: input.rangeLabel, style: 'detailValue' }],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 10],
    },
    {
      columns: [
        { text: strings.totalLabour(totalLabourCost), style: 'summary' },
        { text: strings.totalParts(totalPartsCost), style: 'summary', alignment: 'right' },
      ],
      margin: [0, 0, 0, 16],
    },
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
      margin: [40, 0, 40, 0],
    }),
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 2], color: '#2A5D8C' },
      subtitle: { fontSize: 13, bold: true, margin: [0, 0, 0, 10] },
      summary: { fontSize: 12, bold: true },
      detailKey: { fontSize: 9, color: '#6b6b6b' },
      detailValue: { fontSize: 9 },
      taskBlock: { margin: [0, 0, 0, 12] },
      taskName: { fontSize: 11, bold: true },
      taskCost: { fontSize: 11, bold: true },
      taskMeta: { fontSize: 8, color: '#6b6b6b', margin: [0, 2, 0, 2] },
      taskNotes: { fontSize: 9, italics: true },
      footer: { fontSize: 8, color: '#999999' },
    },
  }
}
