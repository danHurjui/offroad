import fs from 'fs'
import path from 'path'
import {
  ACCEPTABLE_USE,
  COOKIES,
  LEGAL_LAST_UPDATED,
  LOCAL_STORAGE_ENTRIES,
  RETENTION,
  SUB_PROCESSORS,
} from '@/lib/legal'
import { THEME_STORAGE_KEY } from '@/lib/theme'
import { LOCALE_COOKIE, LOCALES } from '@/i18n/config'

/**
 * A privacy policy that contradicts the code is worse than none: it is a
 * statement to users that happens to be false. These tests check the
 * claims that a reader could verify, against the code that makes them
 * true or not.
 *
 * The prose moved to the catalogue when the pages became bilingual, so
 * what used to be a check on one string is now a check on both: an entry
 * that exists in the data but has no sentence in one language would
 * render its dotted key into a published policy.
 */

const CATALOGUES = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')),
  ])
) as Record<string, Record<string, unknown>>

/** A dotted lookup into one catalogue. */
function text(locale: string, dotted: string): string {
  const value = dotted
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[part] : undefined,
      CATALOGUES[locale]
    )
  return typeof value === 'string' ? value : ''
}

/**
 * Asserts the same key says something substantial in every language. The
 * locale and the key are in the assertion's own value so a failure names
 * which one is missing rather than just printing a length.
 */
function expectSaysSomething(dotted: string, minLength = 20) {
  for (const locale of LOCALES) {
    const said = text(locale, dotted).trim()
    expect({ locale, dotted, ok: said.length > minLength }).toEqual({ locale, dotted, ok: true })
  }
}

describe('the cookie list', () => {
  it('is not empty — the app does set cookies', () => {
    expect(COOKIES.length).toBeGreaterThan(0)
  })

  /**
   * The /cookies page says "nothing to consent to" and there is no consent
   * flow behind that claim. That holds only while every cookie is
   * strictly necessary. If this fails, either the claim or the cookie has
   * to go — the page renders a warning for the same reason.
   */
  it('contains only strictly necessary cookies', () => {
    const optional = COOKIES.filter((c) => !c.strictlyNecessary)
    expect(optional.map((c) => c.name)).toEqual([])
  })

  it('describes each one and how long it lasts, in every language', () => {
    for (const cookie of COOKIES) {
      expect(cookie.name.trim()).not.toBe('')
      expectSaysSomething(`legal.cookie.${cookie.id}.purpose`)
      expectSaysSomething(`legal.cookie.${cookie.id}.duration`, 3)
    }
  })

  /**
   * The language choice is the one cookie this app sets itself, and the
   * page has to disclose it like any other. A reader checking devtools
   * finds `riglog-locale` there and must find it here.
   */
  it('lists the language cookie under the name the code sets', () => {
    expect(COOKIES.map((c) => c.name)).toContain(LOCALE_COOKIE)
  })

  it('covers the session and CSRF cookies NextAuth actually sets', () => {
    const names = COOKIES.map((c) => c.name).join(' ')
    expect(names).toContain('session-token')
    expect(names).toContain('csrf-token')
  })
})

describe('local storage disclosures', () => {
  // Named so a reader checking devtools finds what the page describes.
  it('lists the theme key under the name the code actually uses', () => {
    const names = LOCAL_STORAGE_ENTRIES.map((e) => e.name)
    expect(names).toContain(THEME_STORAGE_KEY)
  })

  it('explains each entry, in every language', () => {
    for (const entry of LOCAL_STORAGE_ENTRIES) {
      expectSaysSomething(`legal.storage.${entry.id}.purpose`)
    }
  })
})

describe('sub-processors', () => {
  it('says what each one receives, in every language', () => {
    for (const processor of SUB_PROCESSORS) {
      expectSaysSomething(`legal.subProcessor.${processor.id}.name`, 2)
      expectSaysSomething(`legal.subProcessor.${processor.id}.purpose`, 10)
      expectSaysSomething(`legal.subProcessor.${processor.id}.dataShared`, 10)
      // A conditional entry claims the sharing only happens sometimes, so
      // it owes the reader the condition.
      if (processor.conditional) {
        expectSaysSomething(`legal.subProcessor.${processor.id}.when`, 10)
      }
    }
  })

  /**
   * Derived from the outbound calls in the codebase rather than memory.
   * A new external host in src/lib should come with an entry here.
   */
  it('names every external host the server code calls', () => {
    const hosts: Record<string, string> = {
      'api.brevo.com': 'Brevo',
      'api.resend.com': 'Resend',
      'vpic.nhtsa.dot.gov': 'NHTSA',
      'openstreetmap.org': 'OpenStreetMap',
      'unpkg.com': 'unpkg',
      'challenges.cloudflare.com': 'Cloudflare',
    }

    const sources = collectSources(path.join(process.cwd(), 'src'))
    // Checked against the English names, which is where the proper nouns
    // are; the Romanian page renders the same entries.
    const listed = SUB_PROCESSORS.map((p) => text('en', `legal.subProcessor.${p.id}.name`)).join(' ')

    for (const [host, expectedName] of Object.entries(hosts)) {
      const used = sources.some((content) => content.includes(host))
      if (used) {
        expect(listed).toContain(expectedName)
      }
    }
  })

  it('names the payment processor, since the app takes money', () => {
    expect(SUB_PROCESSORS.map((p) => p.id)).toContain('stripe')
    for (const locale of LOCALES) {
      expect(text(locale, 'legal.subProcessor.stripe.name')).toContain('Stripe')
    }
  })
})

describe('retention', () => {
  it('explains how long each category is kept, in every language', () => {
    expect(RETENTION.length).toBeGreaterThan(0)
    for (const entry of RETENTION) {
      expectSaysSomething(`legal.retention.${entry.id}.what`, 5)
      expectSaysSomething(`legal.retention.${entry.id}.howLong`)
    }
  })

  // Donations survive account deletion (the relation is onDelete: SetNull),
  // so the policy has to say so rather than promising a clean sweep.
  it('discloses that donation records outlive the account', () => {
    expect(RETENTION.map((e) => e.id)).toContain('donations')
    expect(text('en', 'legal.retention.donations.howLong')).toMatch(/kept/i)
    expect(text('ro', 'legal.retention.donations.howLong')).toMatch(/păstrează/i)
  })
})

/** A rule without a reason reads as a threat, in either language. */
describe('acceptable use', () => {
  it('gives every rule its reason, in every language', () => {
    expect(ACCEPTABLE_USE.length).toBeGreaterThan(0)
    for (const rule of ACCEPTABLE_USE) {
      expectSaysSomething(`legal.acceptableUse.${rule.id}.rule`, 10)
      expectSaysSomething(`legal.acceptableUse.${rule.id}.because`, 20)
    }
  })
})

describe('LEGAL_LAST_UPDATED', () => {
  it('is a real date, not a placeholder', () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(LEGAL_LAST_UPDATED))).toBe(false)
  })
})

/** Every .ts/.tsx file under a directory, as strings. */
function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...collectSources(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(fs.readFileSync(full, 'utf8'))
    }
  }
  return out
}
