'use client'

import { isComplete, mergeProposals, parseFuelReceipt, type OcrLine, type ReceiptProposal } from './receiptParse'
import { isInvoiceComplete, mergeInvoiceProposals, parseInvoice, type InvoiceProposal } from './invoiceParse'
import { isTalonComplete, mergeTalonProposals, parseTalon, type TalonProposal } from './talonParse'
import { prepareReceiptPixels, toGrey } from './receiptImage'
import type { PSM as PageSegMode } from 'tesseract.js'

/**
 * RL-048: reads a receipt photo **on the device**, with Tesseract.js.
 *
 * The photo never leaves the phone to be read — the only upload is the one
 * the person asks for, attaching it to the entry — so there is no OCR
 * sub-processor and no per-scan cost. The price is quality: a free engine
 * on a crumpled thermal receipt misreads more than a paid one, which is
 * why receiptParse.ts drops anything read with low confidence rather than
 * proposing it.
 *
 * Every file comes from this site (scripts/copy-ocr-assets.js puts them in
 * public/ocr). Tesseract.js falls back to the jsDelivr CDN for any path
 * left out, so all three are always passed — a test holds that — and the
 * worker is loaded from its file rather than a `blob:` URL, which the CSP
 * (`worker-src 'self'`) refuses.
 */
export const OCR_PATHS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/core',
  langPath: '/ocr/lang',
} as const

/**
 * Tesseract wants text a few dozen pixels tall — about 300 dpi. A receipt at
 * 2000px on its long side is that; a photo taken from further away is
 * scaled up to it (at most double: past that there is nothing to recover).
 */
const OCR_TARGET_SIDE = 2000
const MAX_UPSCALE = 2

/** Decodes, scales and cleans the photo (receiptImage.ts) onto a canvas. */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(MAX_UPSCALE, OCR_TARGET_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const clean = prepareReceiptPixels(toGrey(image.data), canvas.width, canvas.height)
  const px = image.data
  for (let p = 0, i = 0; p < clean.length; p++, i += 4) {
    px[i] = px[i + 1] = px[i + 2] = clean[p]
    px[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export type ScanProgress = { pass: 1 | 2; fraction: number }

interface DocumentReader<P> {
  parse: (lines: OcrLine[]) => P
  complete: (proposal: P) => boolean
  merge: (first: P, second: P) => P
}

/**
 * Reads a document into a proposal. Throws when the image cannot be
 * decoded or the engine cannot load; the caller falls back to the manual
 * form with the photo still attached.
 *
 * Two page-segmentation modes, because each loses different things on
 * different photos: *sparse text* finds right-aligned amounts that a
 * column layout drops, *single block* keeps rows a sparse read scatters.
 * The second look runs only when the first left something the form needs
 * unconfirmed, on the engine already loaded, and the two are combined by
 * the reader's `merge`, which never pairs figures no check saw together.
 */
async function scan<P>(file: File, reader: DocumentReader<P>, onProgress?: (progress: ScanProgress) => void): Promise<P> {
  const canvas = await prepare(file)
  // Loaded only when somebody scans: it is not small.
  const { createWorker, OEM, PSM } = await import('tesseract.js')
  let pass: 1 | 2 = 1
  const worker = await createWorker('ron', OEM.LSTM_ONLY, {
    ...OCR_PATHS,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.({ pass, fraction: m.progress })
    },
  })
  const read = async (mode: PageSegMode): Promise<P> => {
    await worker.setParameters({ tessedit_pageseg_mode: mode })
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
    const lines: OcrLine[] = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          words: line.words.map((word) => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })),
          baseline: line.baseline,
        }))
      )
    )
    return reader.parse(lines)
  }
  try {
    const first = await read(PSM.SPARSE_TEXT)
    if (reader.complete(first)) return first
    pass = 2
    return reader.merge(first, await read(PSM.SINGLE_BLOCK))
  } finally {
    await worker.terminate()
  }
}

/** A fuel receipt → the fuel form (RL-048 slice 1). */
export function scanFuelReceipt(file: File, onProgress?: (progress: ScanProgress) => void): Promise<ReceiptProposal> {
  return scan(file, { parse: (lines) => parseFuelReceipt(lines), complete: isComplete, merge: mergeProposals }, onProgress)
}

/** A service invoice → a workshop job (RL-048 slice 2). */
export function scanInvoice(file: File, onProgress?: (progress: ScanProgress) => void): Promise<InvoiceProposal> {
  return scan(file, { parse: (lines) => parseInvoice(lines), complete: isInvoiceComplete, merge: mergeInvoiceProposals }, onProgress)
}

/**
 * A registration certificate (talon) → the vehicle's identity fields. The
 * photo is read here and discarded: it carries the holder's name, address
 * and personal number, and nothing uploads it.
 */
export function scanTalon(file: File, onProgress?: (progress: ScanProgress) => void): Promise<TalonProposal> {
  return scan(file, { parse: (lines) => parseTalon(lines), complete: isTalonComplete, merge: mergeTalonProposals }, onProgress)
}
