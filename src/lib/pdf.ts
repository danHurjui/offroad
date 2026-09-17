import pdfMake from 'pdfmake'
import type { Content } from 'pdfmake'
import path from 'path'
import { readUpload, StorageError } from '@/lib/storage'

// @types/pdfmake doesn't re-export TDocumentDefinitions from the package
// root (only from an internal ./interfaces module with no matching runtime
// subpath) — derive it from createPdf's own parameter type instead.
export type PdfDocDefinition = Parameters<typeof pdfMake.createPdf>[0]

/**
 * Shared PDF engine for RL-014 (build history export) and RL-033 (job
 * report) — both are pdfmake documents rendered server-side in a route
 * handler (see CLAUDE.md-equivalent notes on RL-014: no Supabase Edge
 * Function here, no headless browser either).
 *
 * pdfmake's standard-14 PDF fonts (Helvetica etc.) don't cover Romanian
 * diacritics (ă â î ș ț), so we register Roboto — bundled as .ttf files
 * under /fonts/Roboto (copied from the pdfmake npm package, Apache-2.0) —
 * and point Next's output file tracing at that directory (next.config.mjs)
 * so the files ship with the Vercel serverless function.
 */
let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const dir = path.join(process.cwd(), 'fonts', 'Roboto')
  pdfMake.setFonts({
    Roboto: {
      normal: path.join(dir, 'Roboto-Regular.ttf'),
      bold: path.join(dir, 'Roboto-Medium.ttf'),
      italics: path.join(dir, 'Roboto-Italic.ttf'),
      bolditalics: path.join(dir, 'Roboto-MediumItalic.ttf'),
    },
  })
  // Every image/font pdfmake touches here is either our own bundled font
  // file or a data: URI we build ourselves from storage.ts — never a path
  // or URL taken from request input — so local access is safe to allow and
  // remote access is safe to deny outright.
  pdfMake.setLocalAccessPolicy(() => true)
  pdfMake.setUrlAccessPolicy(() => false)
  fontsRegistered = true
}

/**
 * One look for both exports.
 *
 * The two documents were styled independently and drifted: the same field
 * was a different grey in each, and neither carried anything that said
 * which product produced it. These are the tokens both now build from,
 * named for their job rather than their hue, the same way globals.css
 * names the on-screen ones.
 *
 * The brand blue is the app's own (`theme_color` in manifest.json), so an
 * exported page and the screen it came from are recognisably the same
 * thing.
 */
export const PDF_COLORS = {
  brand: '#2A5D8C',
  brandTint: '#EAF1F8',
  ink: '#1A1A1A',
  inkMuted: '#5F6B76',
  inkFaint: '#98A2AD',
  rule: '#DFE4EA',
  surfaceSubtle: '#F5F7FA',
  onBrand: '#FFFFFF',
} as const

/** Page geometry, shared so headers and rules line up between documents. */
export const PDF_PAGE = {
  marginX: 40,
  /** A4 width (595.28pt) less both margins. */
  contentWidth: 515,
} as const

/** A hairline the width of the text column. */
export function pdfRule(color: string = PDF_COLORS.rule, marginTop = 6, marginBottom = 10) {
  return {
    canvas: [
      { type: 'line' as const, x1: 0, y1: 0, x2: PDF_PAGE.contentWidth, y2: 0, lineWidth: 0.75, lineColor: color },
    ],
    margin: [0, marginTop, 0, marginBottom] as [number, number, number, number],
  }
}

/**
 * A figure with its label — the "stat tile" of a printed page.
 *
 * A number this size is the thing being reported, so it is set large and
 * the label recedes. No colour carries meaning here: the figures are ink,
 * which keeps them legible in greyscale, which is how most of these are
 * actually printed.
 */
export function pdfStatTile(label: string, value: string, width: number | string) {
  return {
    width,
    stack: [
      { text: label, fontSize: 7.5, color: PDF_COLORS.inkFaint, characterSpacing: 0.4 },
      { text: value, fontSize: 13, bold: true, color: PDF_COLORS.ink, margin: [0, 2, 0, 0] as [number, number, number, number] },
    ],
  }
}

/**
 * @types/pdfmake exports its layout type only from an internal module with
 * no runtime subpath, so derive it from the Content union the same way
 * PdfDocDefinition is derived above. Typing it properly is what makes the
 * callbacks below get checked rather than silently mis-shaped.
 */
type PdfContentTable = Extract<Content, { table: unknown }>
export type PdfTableLayout = Exclude<NonNullable<PdfContentTable['layout']>, string>

/**
 * Table layout: no vertical rules, a hairline under each row, a heavier
 * one under the header and above the total. Vertical rules in a column
 * this narrow add noise and nothing — the columns are already aligned, and
 * the numbers are right-aligned against each other.
 *
 * Outer padding is zero on the first and last columns so the table's text
 * lines up with the body text above it rather than sitting inset by a few
 * points, which reads as a misalignment rather than a table.
 */
export const PDF_TABLE_LAYOUT: PdfTableLayout = {
  hLineWidth: (rowIndex, node) =>
    rowIndex === 1 || rowIndex === node.table.body.length - 1 ? 0.75 : rowIndex === 0 || rowIndex === node.table.body.length ? 0 : 0.5,
  vLineWidth: () => 0,
  hLineColor: (rowIndex) => (rowIndex === 1 ? PDF_COLORS.inkFaint : PDF_COLORS.rule),
  paddingTop: () => 5,
  paddingBottom: () => 5,
  paddingLeft: (columnIndex) => (columnIndex === 0 ? 0 : 6),
  paddingRight: (columnIndex, node) =>
    columnIndex === (node.table.widths?.length ?? 1) - 1 ? 0 : 6,
}

export async function renderPdf(docDefinition: PdfDocDefinition): Promise<Buffer> {
  ensureFonts()
  return pdfMake
    .createPdf({
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      pageMargins: [40, 50, 40, 50],
      ...docDefinition,
    })
    .getBuffer()
}

const EMBEDDABLE_TYPES = new Set(['image/jpeg', 'image/png'])

function inferContentTypeFromExtension(storagePath: string): string | null {
  const ext = path.extname(storagePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  return null
}

/**
 * Resolves a stored upload to a data: URI for embedding in a pdfmake
 * `image` node, or null if it can't be embedded (HEIC/PDF receipts aren't
 * raster images pdfmake can draw, and a missing/unreadable file shouldn't
 * fail the whole report — see the 50-task/100-photo generation budget in
 * RL-014's acceptance criteria).
 */
export async function resolveImageDataUri(storagePath: string): Promise<string | null> {
  try {
    const { buffer, contentType } = await readUpload(storagePath)
    const type = contentType && EMBEDDABLE_TYPES.has(contentType) ? contentType : inferContentTypeFromExtension(storagePath)
    if (!type || !EMBEDDABLE_TYPES.has(type)) return null
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch (e) {
    if (e instanceof StorageError) return null
    throw e
  }
}

export interface PdfPhoto {
  dataUri: string
  caption: string | null
}

/**
 * Resolves up to `limit` stored upload paths to embeddable photos,
 * skipping any that can't be embedded (see resolveImageDataUri). Shared by
 * RL-014's build history export and RL-033's job report.
 */
export async function resolvePhotos(urls: string[], limit: number): Promise<PdfPhoto[]> {
  const dataUris = await Promise.all(urls.slice(0, limit).map((url) => resolveImageDataUri(url)))
  const photos: PdfPhoto[] = []
  for (const dataUri of dataUris) {
    if (dataUri) photos.push({ dataUri, caption: null })
  }
  return photos
}

export function pdfFilename(prefix: string, vehicleName: string, date: Date = new Date()): string {
  const safeVehicleName = vehicleName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const dateStr = date.toISOString().slice(0, 10)
  return `${prefix}_${safeVehicleName}_${dateStr}.pdf`
}
