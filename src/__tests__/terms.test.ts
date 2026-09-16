import fs from 'fs'
import path from 'path'
import {
  ACCEPTABLE_USE,
  CONSUMER_AUTHORITY,
  EU_ODR_URL,
  WITHDRAWAL_PERIOD_DAYS,
} from '@/lib/legal'
import { FREE_TIER } from '@/lib/pro'
import { PRO_PLANS } from '@/lib/stripe'

/**
 * /terms tells the user what they are being given and what they owe. Every
 * number on it is a promise, so none of them is retyped into the page —
 * they come from the constants the code enforces. These tests guard the
 * parts a reader could check and the parts that would quietly rot.
 */

const TERMS = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'terms', 'page.tsx'), 'utf8')

describe('the terms page quotes the code, not a copy of it', () => {
  it('reads its numbers from the modules that enforce them', () => {
    expect(TERMS).toMatch(/from '@\/lib\/pro'/)
    expect(TERMS).toMatch(/from '@\/lib\/stripe'/)
    expect(TERMS).toMatch(/from '@\/lib\/storage'/)
    expect(TERMS).toMatch(/FREE_TIER\.vehicles/)
    expect(TERMS).toMatch(/FREE_TIER\.photosPerTask/)
    expect(TERMS).toMatch(/PRO_PLANS\.(MONTHLY|ANNUAL|LIFETIME)\.priceRon/)
  })

  /**
   * The failure this prevents: someone changes the free tier to two
   * vehicles, and the terms keep promising one — or worse, promises two
   * while the API refuses the second.
   */
  it('hardcodes no price or limit that has a constant', () => {
    const prices = Object.values(PRO_PLANS).map((p) => String(p.priceRon))
    for (const price of prices) {
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
    expect(vehicles).toMatch(/FREE_TIER\.vehicles/)
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

    expect(TERMS).toMatch(/WITHDRAWAL_PERIOD_DAYS/)
    expect(TERMS).toMatch(/full refund/i)
  })

  it('points the reader at the bodies that enforce it', () => {
    expect(EU_ODR_URL).toMatch(/^https:\/\//)
    expect(CONSUMER_AUTHORITY.url).toMatch(/^https:\/\//)
    expect(TERMS).toMatch(/EU_ODR_URL/)
    expect(TERMS).toMatch(/CONSUMER_AUTHORITY/)
  })
})

describe('acceptable use', () => {
  it('gives a reason for every rule', () => {
    expect(ACCEPTABLE_USE.length).toBeGreaterThan(0)
    for (const entry of ACCEPTABLE_USE) {
      expect(entry.rule.trim().length).toBeGreaterThan(10)
      // A rule without a reason reads as a threat, and nobody remembers it.
      expect(entry.because.trim().length).toBeGreaterThan(30)
    }
  })

  it('has no duplicate rules', () => {
    const rules = ACCEPTABLE_USE.map((e) => e.rule)
    expect(new Set(rules).size).toBe(rules.length)
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
  it('does not claim payments are non-refundable outright', () => {
    expect(TERMS).not.toMatch(/all (sales|payments) are final/i)
    expect(TERMS).not.toMatch(/no refunds under any/i)
  })

  it('does not claim it can change the terms without telling anyone', () => {
    expect(TERMS).not.toMatch(/without (prior )?notice/i)
  })

  it('does not disclaim liability for everything', () => {
    expect(TERMS).toMatch(/death or personal injury/i)
    expect(TERMS).toMatch(/consumer/i)
  })
})
