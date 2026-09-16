import fs from 'fs'
import path from 'path'
import { COOKIES, LEGAL_LAST_UPDATED, LOCAL_STORAGE_ENTRIES, RETENTION, SUB_PROCESSORS } from '@/lib/legal'
import { THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * A privacy policy that contradicts the code is worse than none: it is a
 * statement to users that happens to be false. These tests check the
 * claims that a reader could verify, against the code that makes them
 * true or not.
 */

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

  it('describes each one and how long it lasts', () => {
    for (const cookie of COOKIES) {
      expect(cookie.name.trim()).not.toBe('')
      expect(cookie.purpose.trim().length).toBeGreaterThan(20)
      expect(cookie.duration.trim()).not.toBe('')
    }
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

  it('explains each entry', () => {
    for (const entry of LOCAL_STORAGE_ENTRIES) {
      expect(entry.purpose.trim().length).toBeGreaterThan(20)
    }
  })
})

describe('sub-processors', () => {
  it('says what each one receives', () => {
    for (const processor of SUB_PROCESSORS) {
      expect(processor.name.trim()).not.toBe('')
      expect(processor.purpose.trim().length).toBeGreaterThan(10)
      expect(processor.dataShared.trim().length).toBeGreaterThan(10)
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
    }

    const sources = collectSources(path.join(process.cwd(), 'src'))
    const listed = SUB_PROCESSORS.map((p) => p.name).join(' ')

    for (const [host, expectedName] of Object.entries(hosts)) {
      const used = sources.some((content) => content.includes(host))
      if (used) {
        expect(listed).toContain(expectedName)
      }
    }
  })

  it('names the payment processor, since the app takes money', () => {
    expect(SUB_PROCESSORS.map((p) => p.name)).toContain('Stripe')
  })
})

describe('retention', () => {
  it('explains how long each category is kept', () => {
    expect(RETENTION.length).toBeGreaterThan(0)
    for (const entry of RETENTION) {
      expect(entry.what.trim()).not.toBe('')
      expect(entry.howLong.trim().length).toBeGreaterThan(20)
    }
  })

  // Donations survive account deletion (the relation is onDelete: SetNull),
  // so the policy has to say so rather than promising a clean sweep.
  it('discloses that donation records outlive the account', () => {
    const donationEntry = RETENTION.find((e) => /donation/i.test(e.what))
    expect(donationEntry).toBeDefined()
    expect(donationEntry!.howLong).toMatch(/kept/i)
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
