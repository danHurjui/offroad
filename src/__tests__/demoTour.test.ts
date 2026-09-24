import fs from 'fs'
import path from 'path'
import { DEMO_CHAPTERS, DEMO_SECTIONS, chapterValues } from '@/lib/demoTour'
import { LOCALES } from '@/i18n/config'
import { PROJECT_TYPES } from '@/lib/projectType'

/**
 * The public tour at /demo describes features rather than using them,
 * which is exactly why it rots: nothing breaks when it goes out of date,
 * and the people who would notice are the ones who never read it. These
 * are the parts of it a machine can hold to account.
 */

const CATALOGUES = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')),
  ])
) as Record<string, { demo: Record<string, unknown> }>

function lookup(catalogue: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, part) => (typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[part] : undefined),
    catalogue
  )
}

/**
 * The ICU arguments in a message, ignoring anything nested inside a
 * plural's arms — `{vehicles, plural, one {un vehicul} …}` takes one
 * argument, and `un vehicul` is prose that happens to sit in braces.
 * Same reasoning as the catalogue check in i18n.test.ts.
 */
function placeholders(message: string): string[] {
  const found: string[] = []
  let depth = 0
  for (let i = 0; i < message.length; i++) {
    const char = message[i]
    if (char === '}') depth--
    else if (char === '{') {
      if (depth === 0) {
        const name = /^\{\s*(\w+)\s*[,}]/.exec(message.slice(i))
        if (name) found.push(name[1])
      }
      depth++
    }
  }
  return found
}

describe('the tour catalogue', () => {
  it('has no duplicate chapter ids', () => {
    const ids = DEMO_CHAPTERS.map((c) => c.id)
    expect(ids).toEqual([...new Set(ids)])
  })

  it('names only modes that exist', () => {
    for (const chapter of DEMO_CHAPTERS) {
      for (const mode of chapter.modes ?? []) {
        expect(PROJECT_TYPES).toContain(mode)
      }
    }
  })

  /**
   * The whole premise of the page is that it needs no account. A chapter
   * linking to somewhere inside /dashboard would answer "see it live"
   * with the login screen — and to whoever wrote the link, signed in, it
   * would have looked like it worked.
   */
  it('only links a logged-out reader somewhere they can actually go', () => {
    const PUBLIC = ['/', '/demo', '/community', '/community/parts-wanted', '/tickets', '/donate', '/privacy', '/cookies', '/terms', '/sitemap']
    for (const chapter of DEMO_CHAPTERS) {
      if (!chapter.href) continue
      expect({ chapter: chapter.id, href: chapter.href }).toMatchObject({
        href: expect.stringMatching(new RegExp(`^(${PUBLIC.map((p) => p.replace(/\//g, '\\/')).join('|')})$`)),
      })
    }
  })
})

describe('the tour page', () => {
  // The screens live in one module shared with the feature pages.
  const page = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'demo', 'demoPreviews.tsx'), 'utf8')

  /**
   * A chapter without a sample screen renders as a heading and a
   * paragraph beside forty-odd that have pictures — it reads as a
   * feature nobody could show. Every chapter gets a `screen(...)` entry,
   * which is also what puts the "sample data" caption on it.
   */
  it('gives every chapter a framed sample screen', () => {
    for (const chapter of DEMO_CHAPTERS) {
      expect({ chapter: chapter.id, framed: page.includes(`${chapter.id}: screen('${chapter.id}',`) }).toEqual({
        chapter: chapter.id,
        framed: true,
      })
    }
  })
})

describe.each(LOCALES)('the tour text in %s', (locale) => {
  const demo = CATALOGUES[locale].demo

  it('has a title and a body for every section', () => {
    for (const section of DEMO_SECTIONS) {
      for (const field of ['eyebrow', 'title', 'body']) {
        expect({ section: section.id, field, value: lookup(demo, `section.${section.id}.${field}`) }).toMatchObject({
          value: expect.stringMatching(/\S/),
        })
      }
    }
  })

  it('has a title and a body for every chapter', () => {
    for (const chapter of DEMO_CHAPTERS) {
      for (const field of ['title', 'body']) {
        expect({ chapter: chapter.id, field, value: lookup(demo, `chapter.${chapter.id}.${field}`) }).toMatchObject({
          value: expect.stringMatching(/\S/),
        })
      }
    }
  })

  /**
   * A chapter body asking for an argument the page does not pass renders
   * as a gap in one language only. `chapterValues()` is the page's half
   * of that contract, so it is the thing to check against.
   */
  it('asks only for values the page supplies', () => {
    for (const chapter of DEMO_CHAPTERS) {
      const body = String(lookup(demo, `chapter.${chapter.id}.body`) ?? '')
      const supplied = Object.keys(chapterValues(chapter.id) ?? {})
      expect({ chapter: chapter.id, needs: placeholders(body).sort() }).toMatchObject({
        needs: placeholders(body).filter((p) => supplied.includes(p)).sort(),
      })
    }
  })

  /**
   * Prices belong to the ladder (LADDER), which is where the checkout reads them
   * from. A number written into the marketing copy survives a price
   * change, and a tour quoting a price the checkout no longer charges is
   * the one kind of drift here that costs somebody money.
   */
  it('quotes no price it did not get from the ladder', () => {
    const strings: [string, string][] = []
    const walk = (value: unknown, dotted: string) => {
      if (typeof value === 'string') strings.push([dotted, value])
      else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) walk(child, dotted ? `${dotted}.${key}` : key)
      }
    }
    walk(demo, '')

    for (const [key, value] of strings) {
      if (!/\bRON\b/.test(value)) continue
      // The only acceptable RON in the catalogue is one next to a
      // placeholder the page fills in.
      expect({ key, value }).toMatchObject({ value: expect.stringContaining('{price}') })
    }
  })
})

// #106: under React's development StrictMode the effects run twice, and a
// writer that ran before the arrival read replaced `#passport` with the
// first feature. There is no DOM in this suite, so it holds the ordering
// in the source; it was checked in Chromium against `next dev`.
describe('the tour keeps a shared #feature link', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/demo/DemoExplorer.tsx'), 'utf8')

  it('writes the address bar only once the arrival read has been applied', () => {
    expect(source).toMatch(/apply\(\)\s*\n\s*setHashRead\(true\)/)
    expect(source).toMatch(/if \(!active \|\| !hashRead\) return\s*\n\s*window\.history\.replaceState/)
  })

  it('replaces the entry rather than adding one', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/pushState/)
  })
})

// RL-057 (#125): electric cars on the tour, shown by the real functions.
describe('the tour covers electric cars', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

  it('has a free charging chapter among the car records, with its own preview', () => {
    const records = DEMO_SECTIONS.find((s) => s.id === 'records')!
    expect(records.chapters).toContainEqual({ id: 'charging', tier: 'free' })
    expect(read('src/components/demo/demoPreviews.tsx')).toContain("charging: screen('charging', <ChargingPreview />)")
  })

  it('the preview runs the charging functions over samples that show the rules', () => {
    const source = read('src/components/demo/recordPreviews.tsx')
    const preview = source.slice(source.indexOf('export async function ChargingPreview'), source.indexOf('export async function ReceiptScanPreview'))
    expect(preview).toContain('chargeSummary(charges)')
    expect(preview).toContain('chargeConsumption(charges)')
    expect(preview).toContain('computeHealth(')
    expect(preview).toMatch(/totalRon: 0,/) // a free charge
    expect(preview.match(/socTo: 80/g)?.length).toBeGreaterThanOrEqual(2) // an 80% → 80% stretch
  })

  it.each(LOCALES)('%s answers the electric-car question, and the homepage names charging', (locale) => {
    const catalogue = CATALOGUES[locale] as unknown as { demo: Record<string, unknown>; home: Record<string, unknown> }
    expect(typeof lookup(catalogue.demo, 'faq.electric.q')).toBe('string')
    expect(String(lookup(catalogue.demo, 'faq.electric.a'))).toMatch(/kWh/)
    expect(String(lookup(catalogue.home, 'feature.fuel.body'))).toMatch(/electric/i)
  })
})

// Every feature on a page of its own, so a search can land on it.
describe('the feature pages', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

  it('the tour and its feature pages draw from one preview list', () => {
    expect(read('src/app/demo/page.tsx')).toContain('await demoPreviews()')
    expect(read('src/app/demo/[feature]/page.tsx')).toContain('demoPreviews()')
  })

  it('an unknown feature is a 404, and each page has its own canonical and picture', () => {
    const source = read('src/app/demo/[feature]/page.tsx')
    expect(source).toContain('notFound()')
    expect(source).toContain('path: `/demo/${chapter.id}`')
    expect(source).toContain('image: `/og?feature=${chapter.id}`')
  })

  it('the tour index and the homepage cards link to them', async () => {
    expect(read('src/app/demo/page.tsx')).toContain('href={`/demo/${chapter.id}`}')
    const { FEATURE_KEYS, HOME_FEATURE_CHAPTER } = await import('@/lib/demoTour')
    const ids = DEMO_CHAPTERS.map((c) => c.id)
    for (const key of FEATURE_KEYS) expect(ids).toContain(HOME_FEATURE_CHAPTER[key])
  })

  it('a meta description is cut at a word, within what search shows', async () => {
    const { metaDescriptionFrom } = await import('@/lib/demoTour')
    const long = 'cuvânt '.repeat(60)
    const cut = metaDescriptionFrom(long)
    expect(cut.length).toBeLessThanOrEqual(155)
    expect(cut.endsWith('cuvânt…')).toBe(true)
    expect(metaDescriptionFrom('Scurt.')).toBe('Scurt.')
    // A whole sentence that fills half the room or more is where it stops.
    const sentences = `${'a'.repeat(100)}. ${'b '.repeat(60)}`
    expect(metaDescriptionFrom(sentences)).toBe(`${'a'.repeat(100)}.`)
    expect(metaDescriptionFrom(sentences)).not.toMatch(/\.…$/)
  })

  it('the preview picture never draws text from the query', () => {
    const source = read('src/app/og/route.tsx')
    expect(source).toContain('DEMO_CHAPTERS.find((c) => c.id === feature)')
    expect(source).not.toMatch(/searchParams\.get\('(title|text|body)'\)/)
  })
})
