import fs from 'fs'
import path from 'path'
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_NAMES,
  isLocale,
  localeFromAcceptLanguage,
  toLocale,
} from '@/i18n/config'
import { PART_CONDITIONS, ORIGINALITY_CONDITIONS, PROJECT_TYPE_CONFIG, PROJECT_TYPES } from '@/lib/projectType'
import { TICKET_TYPE_VALUES, TICKET_STATUS_VALUES } from '@/lib/tickets'
import { translateConfig, translatePartConditions, translateOriginalityConditions } from '@/lib/vocabulary'

const read = (locale: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8'))

const CATALOGUES = Object.fromEntries(LOCALES.map((l) => [l, read(l)])) as Record<string, Record<string, unknown>>

/** Every leaf key in a catalogue, as dotted paths. */
function leaves(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k)
  )
}

function lookup(catalogue: Record<string, unknown>, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, part) => (typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[part] : undefined),
    catalogue
  )
}

describe('locale resolution', () => {
  it('accepts only the locales we ship', () => {
    expect(isLocale('ro')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale('')).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(['en'])).toBe(false)
  })

  /**
   * The cookie and the database column are both untrusted input by the
   * time they reach a render — one is client-writable, the other can
   * predate the column existing and be null.
   */
  it('coerces anything unusable to the default', () => {
    expect(toLocale('en')).toBe('en')
    expect(toLocale(null)).toBe(DEFAULT_LOCALE)
    expect(toLocale(undefined)).toBe(DEFAULT_LOCALE)
    expect(toLocale('klingon')).toBe(DEFAULT_LOCALE)
    expect(toLocale({ toString: () => 'en' })).toBe(DEFAULT_LOCALE)
  })

  it('reads a region tag as its base language', () => {
    expect(localeFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en')
    expect(localeFromAcceptLanguage('ro-MD')).toBe('ro')
  })

  it('picks the highest-quality language it actually speaks', () => {
    expect(localeFromAcceptLanguage('de;q=0.9,en;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('fr;q=1.0,ro;q=0.2,en;q=0.7')).toBe('en')
  })

  // A header naming nothing we ship must fall through to the caller's
  // default rather than pick the first entry regardless.
  it('returns null when it speaks none of them', () => {
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9')).toBeNull()
    expect(localeFromAcceptLanguage('')).toBeNull()
    expect(localeFromAcceptLanguage(null)).toBeNull()
  })

  // Headers are attacker-controlled. The worst outcome allowed here is
  // the wrong language, never a throw on a page render.
  it('survives a malformed header', () => {
    expect(() => localeFromAcceptLanguage(';;;q=,,,')).not.toThrow()
    expect(() => localeFromAcceptLanguage('en;q=notanumber')).not.toThrow()
    expect(localeFromAcceptLanguage('en;q=0')).toBeNull()
  })

  it('names each language in its own language', () => {
    // Someone looking for English cannot be expected to recognise
    // "Engleză", and vice versa.
    expect(LOCALE_NAMES.en).toBe('English')
    expect(LOCALE_NAMES.ro).toBe('Română')
  })
})

/**
 * A key present in one catalogue and missing from the other renders as
 * the raw dotted key on screen — visible, but only to whoever happens to
 * load that page in that language. This is the check that catches it.
 */
describe('the catalogues', () => {
  const reference = leaves(CATALOGUES[DEFAULT_LOCALE]).sort()

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))('%s covers every key the default has', (locale) => {
    expect(leaves(CATALOGUES[locale]).sort()).toEqual(reference)
  })

  it('has no empty strings standing in for a translation', () => {
    for (const locale of LOCALES) {
      for (const key of leaves(CATALOGUES[locale])) {
        expect({ locale, key, value: lookup(CATALOGUES[locale], key) }).toMatchObject({
          value: expect.stringMatching(/\S/),
        })
      }
    }
  })

  /**
   * ICU placeholders are part of the contract between the catalogue and
   * the call site: a translation that drops `{min}` silently prints a
   * sentence with a hole in it, and one that invents `{minutes}` throws
   * at render time.
   */
  it('uses the same placeholders in every language', () => {
    /**
     * Only the arguments, not the text inside a plural's arms: in
     * `{minutes, plural, one {un minut} other {# minute}}` the argument
     * is `minutes`, and `un minut` is Romanian prose that happens to sit
     * in braces. Counting by brace depth is what tells them apart — a
     * flat regex reads "un" and "a" as placeholders and reports the two
     * languages as disagreeing when they do not.
     */
    const placeholders = (message: string) => {
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
      return found.sort()
    }

    for (const key of reference) {
      const sets = LOCALES.map((l) => placeholders(String(lookup(CATALOGUES[l], key) ?? '')))
      for (const set of sets.slice(1)) expect({ key, set }).toEqual({ key, set: sets[0] })
    }
  })

  // Same reasoning for the rich-text tags in `t.rich` strings.
  it('uses the same rich-text tags in every language', () => {
    const tags = (message: string) => {
      const found: string[] = []
      const pattern = /<(\w+)>/g
      let match: RegExpExecArray | null
      while ((match = pattern.exec(message)) !== null) found.push(match[1])
      return found.sort()
    }

    for (const key of reference) {
      const sets = LOCALES.map((l) => tags(String(lookup(CATALOGUES[l], key) ?? '')))
      for (const set of sets.slice(1)) expect({ key, set }).toEqual({ key, set: sets[0] })
    }
  })
})

/**
 * The vocabulary catalogue is generated from PROJECT_TYPE_CONFIG, so a
 * category added to a mode without a matching label would render as
 * `vocab.category.OFFROAD.WINCHES` on the dashboard. This is what makes
 * adding a category a two-file change rather than a one-file surprise.
 */
describe('the project-type vocabulary', () => {
  it.each(LOCALES)('%s labels every value in every mode', (locale) => {
    const catalogue = CATALOGUES[locale]

    for (const projectType of PROJECT_TYPES) {
      const config = PROJECT_TYPE_CONFIG[projectType]
      const pairs: [string, { value: string }[]][] = [
        [`vocab.status.${projectType}`, config.statusTags],
        [`vocab.category.${projectType}`, config.categories],
        [`vocab.photoType.${projectType}`, config.photoTypes],
        [`vocab.wishlistStatus.${projectType}`, config.wishlistStatuses],
      ]

      for (const [prefix, options] of pairs) {
        for (const option of options) {
          expect({ key: `${prefix}.${option.value}`, value: lookup(catalogue, `${prefix}.${option.value}`) })
            .toMatchObject({ value: expect.stringMatching(/\S/) })
        }
      }

      for (const field of [
        'label',
        'screenTitle',
        'progressLabel',
        'addTaskCta',
        'namePlaceholder',
        'wishlistLabel',
        'communityTabLabel',
      ]) {
        const key = `vocab.mode.${projectType}.${field}`
        expect({ key, value: lookup(catalogue, key) }).toMatchObject({
          value: expect.stringMatching(/\S/),
        })
      }
    }

    for (const option of PART_CONDITIONS) {
      const key = `vocab.partCondition.${option.value}`
      expect({ key, value: lookup(catalogue, key) }).toMatchObject({ value: expect.stringMatching(/\S/) })
    }
    for (const option of ORIGINALITY_CONDITIONS) {
      const key = `vocab.originality.${option.value}`
      expect({ key, value: lookup(catalogue, key) }).toMatchObject({ value: expect.stringMatching(/\S/) })
    }
  })
})

/**
 * Same reasoning for the feedback board's own vocabulary: TICKET_TYPES and
 * TICKET_STATUSES still own the values and the badge colours, and only the
 * label and blurb are looked up per request.
 */
describe('the ticket vocabulary', () => {
  it.each(LOCALES)('%s labels every ticket type and status', (locale) => {
    const catalogue = CATALOGUES[locale]

    for (const type of TICKET_TYPE_VALUES) {
      for (const field of ['label', 'blurb']) {
        const key = `ticketVocab.type.${type}.${field}`
        expect({ key, value: lookup(catalogue, key) }).toMatchObject({
          value: expect.stringMatching(/\S/),
        })
      }
    }

    for (const status of TICKET_STATUS_VALUES) {
      const key = `ticketVocab.status.${status}`
      expect({ key, value: lookup(catalogue, key) }).toMatchObject({
        value: expect.stringMatching(/\S/),
      })
    }
  })
})

/**
 * translateConfig is pure, so it can be driven with a stub translator —
 * no React tree, no request context. What matters is which parts it
 * translates and which it leaves alone.
 */
describe('translateConfig', () => {
  const stub = (key: string) => `T:${key}`

  it.each(PROJECT_TYPES)('%s keeps the stored values untouched', (projectType) => {
    const base = PROJECT_TYPE_CONFIG[projectType]
    const translated = translateConfig(projectType, stub)

    // The value is the contract — Task.category stores SUSPENSION, not
    // "Suspensie" — so translation must never reach it.
    expect(translated.categories.map((o) => o.value)).toEqual(base.categories.map((o) => o.value))
    expect(translated.statusTags.map((o) => o.value)).toEqual(base.statusTags.map((o) => o.value))
    expect(translated.photoTypes.map((o) => o.value)).toEqual(base.photoTypes.map((o) => o.value))
    expect(translated.wishlistStatuses.map((o) => o.value)).toEqual(
      base.wishlistStatuses.map((o) => o.value)
    )
  })

  it.each(PROJECT_TYPES)('%s preserves order, so the UI does not reshuffle', (projectType) => {
    // Off-road's status list deliberately leads with DONE rather than
    // ending with it; sorting by translated label would break that.
    expect(translateConfig(projectType, stub).categories.map((o) => o.value)).toEqual(
      PROJECT_TYPE_CONFIG[projectType].categories.map((o) => o.value)
    )
  })

  /**
   * completeStatus decides progress % and the wishlist "mark as fitted"
   * conversion, and tracksCompletion decides whether a mode shows a
   * progress bar at all. Both are behaviour, not presentation.
   */
  it.each(PROJECT_TYPES)('%s carries behaviour flags through unchanged', (projectType) => {
    const base = PROJECT_TYPE_CONFIG[projectType]
    const translated = translateConfig(projectType, stub)
    expect(translated.completeStatus).toBe(base.completeStatus)
    expect(translated.tracksCompletion).toBe(base.tracksCompletion)
  })

  it('looks each label up under a key scoped by mode', () => {
    // Two modes share the value TYRES with different labels — off-road's
    // "Tyres & Wheels" and the daily driver's. An unscoped key would
    // collapse them.
    expect(translateConfig('OFFROAD', stub).categories.find((o) => o.value === 'TYRES')?.label).toBe(
      'T:category.OFFROAD.TYRES'
    )
    expect(
      translateConfig('DAILY_DRIVER', stub).categories.find((o) => o.value === 'TYRES')?.label
    ).toBe('T:category.DAILY_DRIVER.TYRES')
  })

  it('translates the part and originality lists without reordering them', () => {
    expect(translatePartConditions(stub).map((o) => o.value)).toEqual(PART_CONDITIONS.map((o) => o.value))
    expect(translateOriginalityConditions(stub).map((o) => o.value)).toEqual(
      ORIGINALITY_CONDITIONS.map((o) => o.value)
    )
  })
})

/**
 * The stored value must never depend on the language a request happened
 * to arrive in — a Romanian browser and an English one writing the same
 * category have to produce the same row.
 */
describe('validation is language-independent', () => {
  it('validators read the config, never a catalogue', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'projectType.ts'), 'utf8')
    expect(source).not.toMatch(/next-intl/)
    expect(source).not.toMatch(/getTranslations|useTranslations/)
  })
})
