'use client'

import type { OcrLine } from './receiptParse'

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

/** Tesseract wants ~300 dpi; a receipt at 2000px on its long side is about that. */
const OCR_MAX_SIDE = 2000

/**
 * Greyscale and a contrast stretch — what a photo taken at a pump in bad
 * light needs most. No hard threshold: Tesseract binarises on its own, and
 * does it better per region than one global cut-off would.
 */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < px.length; i += 4) {
    const grey = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    px[i] = grey
    histogram[grey]++
  }
  // Stretch between the 2nd and 98th percentile, so a grey receipt in a
  // dim forecourt spans black to white without a few glints deciding it.
  const total = px.length / 4
  let low = 0
  let high = 255
  for (let seen = 0; low < 255 && seen + histogram[low] < total * 0.02; low++) seen += histogram[low]
  for (let seen = 0; high > 0 && seen + histogram[high] < total * 0.02; high--) seen += histogram[high]
  const range = Math.max(1, high - low)
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(((px[i] - low) * 255) / range)))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/**
 * The receipt's lines, each word with its confidence. Throws when the
 * image cannot be decoded or the engine cannot load; the caller falls back
 * to the manual form with the photo still attached.
 */
export async function readReceipt(file: File, onProgress?: (fraction: number) => void): Promise<OcrLine[]> {
  const canvas = await prepare(file)
  // Loaded only when somebody scans: it is not small.
  const { createWorker, OEM, PSM } = await import('tesseract.js')
  const worker = await createWorker('ron', OEM.LSTM_ONLY, {
    ...OCR_PATHS,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    // A receipt is one column whose rows must stay rows: left to its
    // default, Tesseract splits "TOTAL        233,32" into two blocks.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
    return (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          words: line.words.map((word) => ({ text: word.text, confidence: word.confidence })),
        }))
      )
    )
  } finally {
    await worker.terminate()
  }
}
