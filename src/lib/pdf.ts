import pdfMake from 'pdfmake'
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
