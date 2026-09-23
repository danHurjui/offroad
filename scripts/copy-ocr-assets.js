/**
 * RL-048: copies the receipt reader's engine and language model out of
 * node_modules into public/ocr, so the browser loads them from this site.
 *
 * Tesseract.js falls back to the jsDelivr CDN for every one of these files
 * when no path is given. That would make a CDN a party to every scan and,
 * worse, a moving part the privacy page does not list — so the client
 * (src/lib/ocr.ts) always passes these paths, and this script is what puts
 * the files there. public/ocr is generated, not committed (.gitignore): the
 * files are tens of megabytes and are pinned by package-lock already.
 *
 * Run from `postinstall` and again at the start of `vercel-build`, so both a
 * local install and a Vercel build (whose node_modules may come from cache)
 * end up with them.
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

/**
 * Only the LSTM-only cores: the Romanian model is `best_int`, which has no
 * legacy engine data. Tesseract.js picks one of these three at run time by
 * what the device's WebAssembly supports (getCore.js), so all three ship.
 */
const CORES = ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']

/** [source under node_modules, destination under public] */
function ocrAssets() {
  return [
    ['tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
    ...CORES.map((file) => [`tesseract.js-core/${file}`, `ocr/core/${file}`]),
    ['@tesseract.js-data/ron/4.0.0_best_int/ron.traineddata.gz', 'ocr/lang/ron.traineddata.gz'],
  ]
}

function main() {
  for (const [from, to] of ocrAssets()) {
    const source = path.join(root, 'node_modules', from)
    const target = path.join(root, 'public', to)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }
  console.log(`[copy-ocr-assets] ${ocrAssets().length} files copied to public/ocr`)
}

if (require.main === module) main()

module.exports = { ocrAssets, CORES }
