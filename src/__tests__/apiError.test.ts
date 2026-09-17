import fs from 'fs'
import path from 'path'
import { LOCALES, type Locale } from '@/i18n/config'
import { translator } from '@/i18n/translator'

/**
 * Every route answers with a key rather than a sentence, and the sentence
 * is looked up per request. Two things can rot: a key in the union with
 * no message behind it (which would send the key itself to the client),
 * and a message in the catalogue that nothing uses.
 */

const SOURCE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'apiError.ts'), 'utf8')

/** The ApiErrorKey union, read from the type rather than re-listed here. */
const KEYS = (() => {
  const union = SOURCE.slice(SOURCE.indexOf('export type ApiErrorKey ='), SOURCE.indexOf('/**', SOURCE.indexOf('export type ApiErrorKey =')))
  const found: string[] = []
  const pattern = /'([a-zA-Z]+)'/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(union)) !== null) found.push(match[1])
  return found
})()

const CATALOGUES = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')).apiError as Record<
      string,
      string
    >,
  ])
)

describe('the API error vocabulary', () => {
  it('has keys to check', () => {
    expect(KEYS.length).toBeGreaterThan(50)
  })

  it.each(LOCALES)('%s has a message for every key', (locale) => {
    const missing = KEYS.filter((key) => !(CATALOGUES[locale][key] ?? '').trim())
    expect({ locale, missing }).toEqual({ locale, missing: [] })
  })

  // The other direction: a message nobody can produce is dead weight, and
  // usually means a key was renamed on one side only.
  it.each(LOCALES)('%s has no message without a key', (locale) => {
    const orphans = Object.keys(CATALOGUES[locale]).filter((key) => !KEYS.includes(key))
    expect({ locale, orphans }).toEqual({ locale, orphans: [] })
  })

  it.each(LOCALES)('%s resolves each message without leaving the key behind', async (locale) => {
    const t = await translator(locale as Locale, 'apiError')

    for (const key of KEYS) {
      // The parameterised ones need their values; give every message the
      // superset, which ICU ignores where unused.
      const rendered = t(key, { field: 'costRon', max: 200 })
      expect({ key, locale, rendered }).toMatchObject({ rendered: expect.stringMatching(/\S/) })
      expect(rendered).not.toBe(key)
      expect(rendered).not.toMatch(/\{\w+\}/)
    }
  })
})

/**
 * The code is the half a client can act on — a switch on prose breaks the
 * moment the wording is improved — so it has to reach the body.
 */
describe('the response shape', () => {
  it('sends the key as `code` alongside the translated `error`', () => {
    expect(SOURCE).toMatch(/error: await apiErrorMessage\(key\), code: key/)
  })

  // Three codes predate this and clients already switch on them.
  it('lets a caller keep its own code', () => {
    expect(SOURCE).toMatch(/\.\.\.extra/)
    const rateLimit = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'rateLimit.ts'), 'utf8')
    expect(rateLimit).toMatch(/code: 'RATE_LIMITED'/)
  })

  /**
   * No route may hand-write an English sentence again: that is what this
   * whole change was for, and one missed call site is invisible until a
   * Romanian user hits that exact branch.
   */
  it('leaves no literal error sentence in a route handler', () => {
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8')
          // Backticks too: six upload routes answered with a template
          // literal (`File too large (max ${...}MB)`) and sailed past a
          // check that only looked for single quotes, so every upload in
          // the app scolded a Romanian user in English.
          if (/error:\s*'[^']{4,}'/.test(source) || /error:\s*`[^`]{4,}`/.test(source)) {
            offenders.push(path.relative(process.cwd(), full))
          }
        }
      }
    }
    walk(path.join(process.cwd(), 'src', 'app', 'api'))

    expect(offenders).toEqual([])
  })
})
