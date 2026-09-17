import type { Content } from 'pdfmake'
import type { PdfDocDefinition, PdfPhoto } from '@/lib/pdf'
import type { ProjectType } from '@/lib/projectType'

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
  summary: string
  totalSpent: string
  foundState: string
  acquired: string
  purchasePrice: string
  odometer: string
  condition: string
  workshop: string
  diy: string
  generatedOn: string
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
  acquisitionDate: Date
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

const RON = (n: number) => `${n.toLocaleString('ro-RO')} RON`
const DATE = (d: Date) => d.toLocaleDateString('ro-RO')

function photoRow(photos: PdfTaskPhoto[]): Content | null {
  if (photos.length === 0) return null
  return {
    columns: photos.map((p) => ({ image: p.dataUri, width: 140, margin: [0, 4, 8, 0] as [number, number, number, number] })),
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
  return { stack: content, style: 'taskBlock' }
}

function detailTable(rows: [string, string][]): Content {
  return {
    table: { widths: ['auto', '*'], body: rows.map(([k, v]) => [{ text: k, style: 'detailKey' }, { text: v, style: 'detailValue' }]) },
    layout: 'noBorders',
    margin: [0, 0, 0, 10],
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
  const content: Content[] = [
    { text: input.vehicleName, style: 'title' },
    { text: strings.subtitle, style: 'subtitle' },
  ]

  if (input.coverPhotoDataUri) {
    content.push({ image: input.coverPhotoDataUri, width: 300, margin: [0, 10, 0, 10] })
  }

  const details: [string, string][] = []
  if (input.generation) details.push([strings.generation, input.generation])
  if (input.engine) details.push([strings.engine, input.engine])
  if (input.vin) details.push([strings.vin, input.vin])
  if (details.length > 0) content.push(detailTable(details))

  content.push({
    columns: [
      { text: strings.summary, style: 'summary' },
      { text: strings.totalSpent, style: 'summary', alignment: 'right' },
    ],
    margin: [0, 0, 0, 16],
  })

  if (input.foundState) {
    const fs = input.foundState
    content.push({ text: strings.foundState, style: 'sectionHeader' })
    const rows: [string, string][] = [[strings.acquired, DATE(fs.acquisitionDate)]]
    if (fs.purchasePriceRon != null) rows.push([strings.purchasePrice, RON(fs.purchasePriceRon)])
    if (fs.odometer != null) rows.push([strings.odometer, `${fs.odometer.toLocaleString('ro-RO')} km`])
    if (fs.conditionRating != null) rows.push([strings.condition, `${fs.conditionRating}/5`])
    content.push(detailTable(rows))
    if (fs.knownHistory) content.push({ text: fs.knownHistory, style: 'taskNotes', margin: [0, 0, 0, 6] })
    const fsPhotos = photoRow(fs.photos)
    if (fsPhotos) content.push(fsPhotos)
    content.push({ text: '', margin: [0, 0, 0, 10] })
  }

  for (const category of input.categories) {
    if (category.tasks.length === 0) continue
    content.push({ text: category.categoryLabel, style: 'sectionHeader', pageBreak: 'before' })
    for (const task of category.tasks) content.push(taskBlock(task, strings))
  }

  return {
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: strings.generatedOn, style: 'footer' },
        { text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right' },
      ],
      margin: [40, 0, 40, 0],
    }),
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 11, color: '#6b6b6b', margin: [0, 0, 0, 10] },
      summary: { fontSize: 12, bold: true },
      sectionHeader: { fontSize: 14, bold: true, margin: [0, 0, 0, 8], color: '#2A5D8C' },
      detailKey: { fontSize: 9, color: '#6b6b6b' },
      detailValue: { fontSize: 9 },
      taskBlock: { margin: [0, 0, 0, 12] },
      taskName: { fontSize: 11, bold: true },
      taskCost: { fontSize: 11, bold: true },
      taskMeta: { fontSize: 8, color: '#6b6b6b', margin: [0, 2, 0, 2] },
      taskNotes: { fontSize: 9, italics: true, margin: [0, 2, 0, 2] },
      footer: { fontSize: 8, color: '#999999' },
    },
  }
}
