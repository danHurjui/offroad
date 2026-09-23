import fs from 'fs'
import path from 'path'
import { OCR_PATHS } from '@/lib/ocr'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ocrAssets, CORES } = require('../../scripts/copy-ocr-assets.js') as {
  ocrAssets: () => [string, string][]
  CORES: string[]
}

/**
 * RL-048: the receipt reader runs on the device, from files this site
 * serves. Tesseract.js quietly fetches anything it is not given a path for
 * from the jsDelivr CDN — which would still "work", and would make a third
 * party a party to every scan without the privacy page saying so. These
 * hold the wiring that prevents that.
 */

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const destinations = () => ocrAssets().map(([, to]) => `/${to}`)

describe('the engine is served from this site', () => {
  it('passes every path, and never a blob: worker', () => {
    const source = read('src/lib/ocr.ts')
    expect(source).toContain('...OCR_PATHS,')
    expect(source).toContain('workerBlobURL: false')
    for (const value of Object.values(OCR_PATHS)) expect(value.startsWith('/ocr/')).toBe(true)
  })

  it('the copy script puts a file at each path the client asks for', () => {
    const files = destinations()
    expect(files).toContain(OCR_PATHS.workerPath)
    // The language the worker is created with is the one copied.
    const lang = /createWorker\('(\w+)'/.exec(read('src/lib/ocr.ts'))?.[1]
    expect(lang).toBe('ron')
    expect(files).toContain(`${OCR_PATHS.langPath}/${lang}.traineddata.gz`)
    for (const core of CORES) expect(files).toContain(`${OCR_PATHS.corePath}/${core}`)
  })

  it('copies every LSTM core Tesseract.js may choose on a device', () => {
    // getCore.js picks one of these by the device's WebAssembly support;
    // a version that renames them must fail here, not on somebody's phone.
    const getCore = read('node_modules/tesseract.js/src/worker-script/browser/getCore.js')
    const chosen = Array.from(getCore.matchAll(/tesseract-core-[\w-]*lstm\.wasm\.js/g)).map((m) => m[0])
    expect(new Set(chosen)).toEqual(new Set(CORES))
  })

  it('every source exists in node_modules', () => {
    for (const [from] of ocrAssets()) {
      expect(fs.existsSync(path.join(process.cwd(), 'node_modules', from))).toBe(true)
    }
  })

  it('runs on install and before the Vercel build', () => {
    expect(JSON.parse(read('package.json')).scripts.postinstall).toContain('node scripts/copy-ocr-assets.js')
    expect(read('scripts/vercel-build.js')).toContain("'scripts/copy-ocr-assets.js'")
    expect(read('.gitignore')).toContain('/public/ocr/')
  })

  it('the CSP lets the worker compile WebAssembly and load from this origin only', () => {
    const config = read('next.config.mjs')
    expect(config).toContain(`"'wasm-unsafe-eval'"`)
    expect(config).toContain(`"worker-src 'self'"`)
  })

  it('nothing but src/lib/ocr.ts loads tesseract.js', () => {
    function sources(dir: string): string[] {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full)
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
      })
    }
    const offenders = sources(path.join(process.cwd(), 'src'))
      .filter((file) => /['"]tesseract\.js['"]/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(process.cwd(), file))
    expect(offenders).toEqual([path.join('src', 'lib', 'ocr.ts')])
  })
})

describe('the scan proposes, it never saves', () => {
  it('reading a receipt sends nothing', () => {
    const form = read('src/components/FuelQuickAdd.tsx')
    const onScan = form.slice(form.indexOf('async function onScan'), form.indexOf('function unsureNote'))
    expect(onScan).not.toMatch(/fetch|onSubmit|requestSubmit/)
  })
})
