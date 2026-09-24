import { FREE_TIER } from './pro'
import type { ProjectType } from './projectType'

/**
 * The contents of the public tour at `/demo`, as structure rather than
 * prose.
 *
 * Same split as the homepage's `FEATURE_KEYS`, one size up: the order,
 * the grouping, which tier a feature belongs to and where the real thing
 * can be seen live are decided here; every word is looked up from
 * `messages/*.json` under `demo.chapter.<id>`. A tour is a page that
 * drifts out of date quietly — it describes features rather than using
 * them — so the parts that *can* be checked mechanically are kept in
 * TypeScript where `demoTour.test.ts` can reach them, and the numbers it
 * quotes (`FREE_TIER`, `LADDER`) are read from their own modules at
 * render time rather than written into the catalogue.
 *
 * Adding a chapter is one entry here plus one block per language; the
 * i18n suite fails if a language is missing one.
 */

/**
 * Which plan a feature belongs to.
 *
 * Three values, because the app has three answers: free, the account's
 * own paid plan (`hasPro()`, sold as Personal — the id kept its old name),
 * and a company plan (`orgHasPaidFeatures()`, RL-042). Where the boundary
 * runs *through* a feature (posting a parts request needs Personal,
 * replying to one doesn't; the cost total is free, its breakdown is not)
 * the body text says so; a finer badge would put that nuance where nobody
 * reads it.
 */
export type DemoTier = 'free' | 'pro' | 'business'

export const DEMO_TIERS: DemoTier[] = ['free', 'pro', 'business']

/** The badge's label (`demo.<key>`) and its palette, per tier. */
export const TIER_LABEL_KEY: Record<DemoTier, 'tierFree' | 'tierPro' | 'tierBusiness'> = {
  free: 'tierFree',
  pro: 'tierPro',
  business: 'tierBusiness',
}
export const TIER_BADGE: Record<DemoTier, string> = {
  free: 'badge-neutral',
  pro: 'badge-brand',
  business: 'badge-info',
}

export interface DemoChapter {
  /** Message key root: `demo.chapter.<id>.title` / `.body`. */
  id: string
  tier: DemoTier
  /**
   * The modes this exists in. Omitted means all three.
   *
   * These mirror the explicit `=== 'RESTORATION'` / `=== 'OFFROAD'`
   * checks in the app itself — a feature listed for every mode that is
   * in fact gated to one reads as a missing feature to everybody else.
   */
  modes?: ProjectType[]
  /**
   * A public page where this can be seen for real, right now.
   *
   * Only ever a page a logged-out reader can open: the tour's whole
   * premise is that it needs no account, and a link into `/dashboard`
   * would answer it with the login screen. `demoTour.test.ts` enforces
   * that.
   */
  href?: string
}

export interface DemoSection {
  /** Message key root: `demo.section.<id>.title` / `.body`. */
  id: string
  chapters: DemoChapter[]
}

export const DEMO_SECTIONS: DemoSection[] = [
  {
    id: 'log',
    chapters: [
      { id: 'modes', tier: 'free' },
      { id: 'tasks', tier: 'free' },
      { id: 'photos', tier: 'free' },
      { id: 'documents', tier: 'free' },
      { id: 'costs', tier: 'free' },
      { id: 'wishlist', tier: 'free' },
      { id: 'foundState', tier: 'free', modes: ['RESTORATION'] },
      { id: 'jobReport', tier: 'free' },
    ],
  },
  {
    id: 'pro',
    chapters: [
      { id: 'analytics', tier: 'pro' },
      { id: 'collaborators', tier: 'pro' },
      { id: 'trailLog', tier: 'pro', modes: ['OFFROAD'] },
      { id: 'cards', tier: 'pro', modes: ['OFFROAD', 'RESTORATION'] },
      { id: 'limits', tier: 'pro' },
      { id: 'pdfExport', tier: 'pro' },
      { id: 'originality', tier: 'pro', modes: ['RESTORATION'] },
      { id: 'vinDecoder', tier: 'pro', modes: ['RESTORATION'] },
      { id: 'priceAlert', tier: 'pro' },
    ],
  },
  {
    // Phase 5 (#49): the records a car on the road accumulates.
    id: 'records',
    chapters: [
      { id: 'identity', tier: 'free' },
      { id: 'odometer', tier: 'free' },
      { id: 'fuel', tier: 'free' },
      { id: 'receiptScan', tier: 'pro' },
      { id: 'health', tier: 'free' },
      { id: 'tyres', tier: 'free', modes: ['OFFROAD', 'DAILY_DRIVER'] },
      { id: 'ownership', tier: 'free' },
      { id: 'serviceBook', tier: 'free' },
      { id: 'passport', tier: 'pro' },
      { id: 'accidents', tier: 'free' },
    ],
  },
  {
    // RL-038–042: organisations and their fleets, on a company plan.
    id: 'business',
    chapters: [
      { id: 'organization', tier: 'business' },
      { id: 'fleetBoard', tier: 'business' },
      { id: 'fleetCosts', tier: 'business' },
      { id: 'drivers', tier: 'business' },
      { id: 'trips', tier: 'business' },
      { id: 'fleetReports', tier: 'business' },
    ],
  },
  {
    id: 'community',
    chapters: [
      { id: 'publicBuild', tier: 'free', href: '/community' },
      { id: 'feed', tier: 'free', href: '/community' },
      { id: 'partsWanted', tier: 'pro', href: '/community/parts-wanted' },
      { id: 'roadmap', tier: 'free', href: '/tickets' },
    ],
  },
  {
    id: 'app',
    chapters: [
      { id: 'languages', tier: 'free' },
      { id: 'install', tier: 'free' },
      { id: 'theme', tier: 'free' },
      { id: 'shortcuts', tier: 'free' },
      { id: 'yourData', tier: 'free', href: '/privacy' },
    ],
  },
]

export const DEMO_CHAPTERS: DemoChapter[] = DEMO_SECTIONS.flatMap((section) => section.chapters)

/**
 * Numbers a chapter's text needs, supplied from the module that owns
 * each one.
 *
 * The free tier's limits are enforced in the vehicles and photos routes,
 * quoted on the upgrade page, and promised in /terms. A tour that wrote
 * them out again would be a fourth copy, and the one nobody thinks to
 * update — so the catalogue holds `{vehicles}` and this holds the value.
 *
 * It lives here rather than in the page because `demoTour.test.ts` checks
 * the other half of the bargain: that every placeholder a chapter's text
 * uses is one of these. A body that asks for an argument nobody passes
 * renders as a hole in a sentence, in one language, on a page the people
 * who wrote it rarely reload.
 */
export function chapterValues(chapterId: string): Record<string, string | number> | undefined {
  if (chapterId === 'limits') {
    return { vehicles: FREE_TIER.vehicles, photos: FREE_TIER.photosPerTask }
  }
  return undefined
}

/**
 * The questions on `/demo`, in the order they are asked.
 *
 * Ordinary prose on the page, not `FAQPage` JSON-LD: Google retired the
 * FAQ rich result on 7 May 2026, so the markup would render nothing
 * anywhere. See the note in `src/lib/structuredData.ts`. What these are
 * for is the long-tail query itself — somebody typing "is it free" or
 * "îmi aduce aminte de ITP" is asking to be sold to, and the page should
 * answer in the words they used.
 *
 * Only `free` interpolates anything, and the page supplies it from the
 * ladder (`LADDER`, `src/lib/plans.ts`), so no price is written here.
 */
export const DEMO_FAQ_IDS = [
  'free',
  'phone',
  'reminders',
  'mechanic',
  'private',
  'daily',
  'sell',
  'company',
  'leave',
] as const
