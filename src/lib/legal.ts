/**
 * Facts behind /privacy and /cookies.
 *
 * They live in one module because both pages describe the same system and
 * a policy that contradicts the code is worse than no policy: it is a
 * statement to users that happens to be false. Anything here that a reader
 * could check — which cookies exist, which third parties receive data —
 * is written from what the code actually does, and the comments say where
 * to look.
 *
 * When you add a service that receives user data, add it to
 * SUB_PROCESSORS in the same change. That is the whole point of the list.
 */

/**
 * Bump when the substance changes, not for a typo. Shown on both pages so
 * a reader can tell whether they've seen this version.
 */
export const LEGAL_LAST_UPDATED = '2026-09-16'

/**
 * Who to contact about a data request. Not hardcoded: whoever deploys this
 * is the controller, and printing an address the operator doesn't monitor
 * would be worse than printing none. When unset the pages route people to
 * the feedback board instead, which always works.
 */
export const PRIVACY_CONTACT_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL ?? null

/** The operator's legal name, if they've configured one. */
export const PRIVACY_CONTROLLER = process.env.NEXT_PUBLIC_PRIVACY_CONTROLLER ?? null

export interface CookieEntry {
  /**
   * Catalogue key for the prose: `legal.cookie.<id>.purpose` and
   * `.duration`. The name and the flags stay here because they are facts
   * about the system; the sentences describing them have to be readable
   * in both languages, and legal.test.ts checks each id has both.
   */
  id: string
  name: string
  /**
   * Strictly necessary cookies need to be disclosed but not consented to
   * (ePrivacy Art. 5(3) exemption). Everything in this app is one; if a
   * cookie is ever added that isn't, this flag is what should force a
   * consent flow rather than a notice.
   */
  strictlyNecessary: boolean
}

/**
 * Every cookie the app sets: NextAuth's four, plus the one this app sets
 * itself for the language choice. There is no analytics, advertising or
 * tracking script anywhere in the bundle.
 *
 * The NextAuth names are v4's defaults; the `__Secure-`/`__Host-`
 * prefixes appear only over HTTPS, which is why both spellings are
 * described together.
 */
export const COOKIES: CookieEntry[] = [
  {
    id: 'session',
    name: 'next-auth.session-token (__Secure- prefixed over HTTPS)',
    strictlyNecessary: true,
  },
  {
    id: 'csrf',
    name: 'next-auth.csrf-token (__Host- prefixed over HTTPS)',
    strictlyNecessary: true,
  },
  {
    id: 'callbackUrl',
    name: 'next-auth.callback-url',
    strictlyNecessary: true,
  },
  {
    id: 'oauthState',
    name: 'next-auth.state / next-auth.pkce.code_verifier',
    strictlyNecessary: true,
  },
  {
    // The one cookie this app sets itself. Strictly necessary in the
    // ePrivacy sense: the server renders the text, so it cannot answer in
    // the language you chose without being told which one that is. It
    // carries no identifier and nothing is authorised by it.
    id: 'locale',
    name: 'riglog-locale',
    strictlyNecessary: true,
  },
]

/**
 * Things stored in the browser that are not cookies — worth listing
 * because people reasonably ask about them, and because a reader checking
 * devtools will find them.
 */
export const LOCAL_STORAGE_ENTRIES = [
  { id: 'theme', name: 'riglog-theme' },
  { id: 'cookieNotice', name: 'riglog-cookie-notice' },
  { id: 'trailRecording', name: 'riglog-trail-recording' },
]

export interface SubProcessor {
  /**
   * Catalogue key: `legal.subProcessor.<id>` carries `name`, `purpose`,
   * `dataShared` and — where the sharing is conditional on a feature or a
   * configuration — `when`.
   */
  id: string
  /** Whether the entry has a `when` clause in the catalogue. */
  conditional?: boolean
}

/**
 * Every third party that receives user data, derived from the outbound
 * calls in the codebase rather than from memory.
 */
export const SUB_PROCESSORS: SubProcessor[] = [
  { id: 'vercel' },
  { id: 'database' },
  { id: 'stripe', conditional: true },
  { id: 'emailProvider', conditional: true },
  { id: 'google', conditional: true },
  { id: 'cloudflare', conditional: true },
  { id: 'openstreetmap', conditional: true },
  { id: 'unpkg', conditional: true },
  { id: 'nhtsa', conditional: true },
  { id: 'pushService', conditional: true },
]

export interface RetentionEntry {
  /** Catalogue key: `legal.retention.<id>.what` and `.howLong`. */
  id: string
}

/**
 * What survives account deletion, and why. Checked against the schema's
 * cascade rules and the DELETE handlers — see src/lib/personalData.ts.
 */
export const RETENTION: RetentionEntry[] = [
  { id: 'yourContent' },
  { id: 'publicPosts' },
  // Kept deliberately: a payment that happened is an accounting record.
  { id: 'donations' },
  { id: 'resetTokens' },
  // The key is plain text (src/lib/rateLimit.ts) — `login:email:<address>`
  // or `register:ip:<address>` — so calling these "anonymous counters"
  // would be false, and the catalogue text says so.
  { id: 'rateLimits' },
]

/**
 * Consumer withdrawal period for a distance contract, in days.
 *
 * Romania's OUG 34/2014 (transposing Directive 2011/83/EU) gives a
 * consumer 14 days to withdraw from a distance purchase. Digital content
 * supplied immediately is exempt *only* where the buyer has given express
 * prior consent to immediate performance and acknowledged losing the
 * right — and this app's Stripe Checkout asks for neither. So the right
 * applies in full, and /terms says so rather than claiming a "no refunds"
 * policy that would not survive contact with a consumer-protection
 * authority.
 *
 * If a consent step is ever added to checkout, this is the constant and
 * the terms section to revisit — not a thing to quietly reword.
 */
export const WITHDRAWAL_PERIOD_DAYS = 14

/**
 * The EU's online dispute resolution portal. Traders selling online to EU
 * consumers have to link it.
 */
export const EU_ODR_URL = 'https://ec.europa.eu/consumers/odr'

/** Romania's consumer protection authority. */
export const CONSUMER_AUTHORITY = {
  name: 'ANPC',
  url: 'https://anpc.ro',
}

export interface AcceptableUseRule {
  /**
   * Catalogue key: `legal.acceptableUse.<id>.rule` and `.because`. Every
   * rule carries its reason — a rule without one reads as a threat.
   */
  id: string
}

/**
 * What you may not do with the account. Kept short and specific: a list
 * that tries to forbid everything forbids nothing anyone can remember, and
 * each of these maps to something the app actually exposes.
 */
export const ACCEPTABLE_USE: AcceptableUseRule[] = [
  { id: 'othersWork' },
  { id: 'privateInfo' },
  { id: 'spam' },
  { id: 'otherAccounts' },
  { id: 'automation' },
  { id: 'resale' },
]
