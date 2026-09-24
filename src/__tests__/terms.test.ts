import fs from 'fs'
import path from 'path'
import {
  ACCEPTABLE_USE,
  CONSUMER_AUTHORITY,
  EU_ODR_URL,
  WITHDRAWAL_PERIOD_DAYS,
} from '@/lib/legal'
import { FREE_TIER } from '@/lib/pro'
import { LADDER } from '@/lib/plans'
import { LOCALES } from '@/i18n/config'

/**
 * /terms tells the user what they are being given and what they owe. Every
 * number on it is a promise, so none of them is retyped into the page —
 * they come from the constants the code enforces. These tests guard the
 * parts a reader could check and the parts that would quietly rot.
 *
 * Since the page became bilingual there are two things to check and they
 * are different: TERMS is the page's *code*, which is where the constants
 * are read and interpolated, and `wording(locale)` is the prose, which is
 * where the promises live. A clause that would be unenforceable against a
 * consumer is just as unenforceable in Romanian, so the "must not say"
 * checks run over every language rather than only the authoritative one.
 */

const TERMS = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'terms', 'page.tsx'), 'utf8')

/** Every sentence of the terms in one language, as a single string. */
function wording(locale: string): string {
  const catalogue = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
  )
  return Object.values(catalogue.legalPages.terms as Record<string, string>).join('\n')
}

const ENGLISH = wording('en')

describe('the terms page quotes the code, not a copy of it', () => {
  it('reads its numbers from the modules that enforce them', () => {
    expect(TERMS).toMatch(/from '@\/lib\/pro'/)
    expect(TERMS).toMatch(/from '@\/lib\/plans'/)
    expect(TERMS).toMatch(/from '@\/lib\/storage'/)
    expect(TERMS).toMatch(/FREE_TIER\.vehicles/)
    expect(TERMS).toMatch(/FREE_TIER\.photosPerTask/)
    expect(TERMS).toMatch(/LADDER\.PERSONAL\.(monthlyRon|annualRon|lifetimeRon)/)
    expect(TERMS).toMatch(/LADDER\.PERSONAL\.vehicles/)
  })

  /**
   * The failure this prevents: someone changes the free tier to two
   * vehicles, and the terms keep promising one — or worse, promises two
   * while the API refuses the second.
   */
  it('hardcodes no price or limit that has a constant', () => {
    const prices = Object.values(LADDER).flatMap((tier) => [tier.monthlyRon, tier.annualRon, tier.lifetimeRon])
    for (const ron of prices) {
      if (!ron) continue
      const price = String(ron)
      // The digits may appear inside an import path or a date; what must
      // not appear is a price written next to "RON".
      expect(TERMS).not.toMatch(new RegExp(`${price.replace('.', '\\.')}\\s*RON`))
    }
  })
})

describe('free tier limits', () => {
  it('are positive and centralised', () => {
    expect(FREE_TIER.vehicles).toBeGreaterThan(0)
    expect(FREE_TIER.photosPerTask).toBeGreaterThan(0)
  })

  /**
   * Both routes must enforce the shared constant rather than a literal of
   * their own, or the terms describe a limit nothing applies.
   */
  it('are enforced from the shared constant by the routes that gate them', () => {
    const vehicles = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'api', 'vehicles', 'route.ts'),
      'utf8'
    )
    const photos = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'api', 'vehicles', '[id]', 'tasks', '[taskId]', 'photos', 'route.ts'),
      'utf8'
    )
    // The vehicle allowance goes through vehicleAllowance.ts, which reads
    // the ladder — and the ladder's Free rung is FREE_TIER.vehicles.
    expect(vehicles).toMatch(/refuseOverVehicleLimit/)
    expect(LADDER.FREE.vehicles).toBe(FREE_TIER.vehicles)
    expect(photos).toMatch(/FREE_TIER\.photosPerTask/)
    // And no stray local copy left behind.
    expect(vehicles).not.toMatch(/FREE_TIER_VEHICLE_LIMIT\s*=/)
    expect(photos).not.toMatch(/FREE_TIER_PHOTOS_PER_TASK\s*=/)
  })
})

describe('the consumer withdrawal right', () => {
  it('is the 14 days EU and Romanian law require', () => {
    expect(WITHDRAWAL_PERIOD_DAYS).toBe(14)
  })

  /**
   * The right can be waived for digital content supplied immediately, but
   * only against an express consent plus an acknowledgement of losing it.
   * Stripe Checkout as configured here collects neither, so the terms must
   * grant the refund rather than claim it away.
   *
   * If a consent step is ever added to checkout, this test is the place
   * that should fail and force the terms to be revisited deliberately.
   */
  it('is granted in full, because checkout never asks the buyer to waive it', () => {
    const checkout = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'api', 'billing', 'checkout', 'route.ts'),
      'utf8'
    )
    const asksForWaiver = /withdraw|consent_collection|terms_of_service_acceptance/i.test(checkout)
    expect(asksForWaiver).toBe(false)

    // The page reads the constant rather than retyping the number…
    expect(TERMS).toMatch(/WITHDRAWAL_PERIOD_DAYS/)
    // …and the authoritative wording grants the refund rather than
    // claiming it away.
    expect(ENGLISH).toMatch(/full refund/i)
    expect(ENGLISH).toMatch(/\{days\}/)
  })

  it('points the reader at the bodies that enforce it', () => {
    expect(EU_ODR_URL).toMatch(/^https:\/\//)
    expect(CONSUMER_AUTHORITY.url).toMatch(/^https:\/\//)
    expect(TERMS).toMatch(/EU_ODR_URL/)
    expect(TERMS).toMatch(/CONSUMER_AUTHORITY/)
  })
})

/**
 * The rules' wording moved to the catalogue when the page became
 * bilingual — legal.test.ts checks each id has a rule and a reason in
 * both languages. What has to hold here is that the list itself is
 * well-formed.
 */
describe('acceptable use', () => {
  it('has no duplicate entries', () => {
    expect(ACCEPTABLE_USE.length).toBeGreaterThan(0)
    const ids = ACCEPTABLE_USE.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.trim()).not.toBe('')
  })

  // The page renders both halves of each entry; a rule shown without its
  // reason reads as a threat.
  it('is rendered with its reason on the page', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'terms', 'page.tsx'), 'utf8')
    expect(page).toMatch(/acceptableUse\.\$\{entry\.id\}\.rule/)
    expect(page).toMatch(/acceptableUse\.\$\{entry\.id\}\.because/)
  })
})

describe('the terms are reachable', () => {
  const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')

  it('are linked from the public footer', () => {
    expect(read('components', 'PublicFooter.tsx')).toMatch(/href="\/terms"/)
  })

  // Agreeing to terms you were never shown is not agreement.
  it('are linked from the signup form that binds you to them', () => {
    expect(read('app', 'register', 'page.tsx')).toMatch(/href="\/terms"/)
  })

  it('are crawlable and in the sitemap', () => {
    expect(read('app', 'robots.ts')).toMatch(/'\/terms'/)
    expect(read('app', 'sitemap.ts')).toMatch(/\/terms/)
  })
})

describe('what the terms must not claim', () => {
  // Each of these would be unenforceable against an EU consumer, and
  // saying it anyway is the kind of thing a regulator notices.
  it.each(LOCALES)('does not claim payments are non-refundable outright (%s)', (locale) => {
    const text = wording(locale)
    expect(text).not.toMatch(/all (sales|payments) are final/i)
    expect(text).not.toMatch(/no refunds under any/i)
    expect(text).not.toMatch(/nerambursabil[ăe]? în (orice|toate)/i)
  })

  it.each(LOCALES)('does not claim it can change the terms without telling anyone (%s)', (locale) => {
    const text = wording(locale)
    expect(text).not.toMatch(/without (prior )?notice/i)
    expect(text).not.toMatch(/fără (o )?notificare prealabilă/i)
  })

  // Checked in the authoritative language, where the carve-out is worded.
  it('does not disclaim liability for everything', () => {
    expect(ENGLISH).toMatch(/death or personal injury/i)
    expect(ENGLISH).toMatch(/consumer/i)
  })

  /**
   * Both versions have to make the same promises. A translation that
   * quietly dropped the withdrawal right or the liability carve-out would
   * be the exact failure the precedence note exists to contain — and it
   * should not get that far.
   */
  it.each(LOCALES)('keeps the load-bearing clauses in every language (%s)', (locale) => {
    const catalogue = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
    ).legalPages.terms as Record<string, string>

    for (const key of ['withdrawal', 'afterWithdrawal', 'liability1', 'liability2', 'losingPro']) {
      expect({ locale, key, present: (catalogue[key] ?? '').trim().length > 40 }).toEqual({
        locale,
        key,
        present: true,
      })
    }
  })
})
