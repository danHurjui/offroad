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
  name: string
  purpose: string
  /** How long it lasts, in words. */
  duration: string
  /**
   * Strictly necessary cookies need to be disclosed but not consented to
   * (ePrivacy Art. 5(3) exemption). Everything in this app is one; if a
   * cookie is ever added that isn't, this flag is what should force a
   * consent flow rather than a notice.
   */
  strictlyNecessary: boolean
}

/**
 * Every cookie the app sets. All of them are NextAuth's — the app sets
 * none of its own (grep for `cookies()` / `Set-Cookie`), and there is no
 * analytics, advertising or tracking script anywhere in the bundle.
 *
 * Names are NextAuth v4's defaults; the `__Secure-`/`__Host-` prefixes
 * appear only over HTTPS, which is why both spellings are described
 * together.
 */
export const COOKIES: CookieEntry[] = [
  {
    name: 'next-auth.session-token (__Secure- prefixed over HTTPS)',
    purpose:
      'Keeps you logged in. It holds a signed token identifying your account — without it every page would ask you to log in again.',
    duration: '30 days, or until you log out',
    strictlyNecessary: true,
  },
  {
    name: 'next-auth.csrf-token (__Host- prefixed over HTTPS)',
    purpose:
      'Protects sign-in and sign-out from cross-site request forgery — it stops another site submitting those forms on your behalf.',
    duration: 'The browser session',
    strictlyNecessary: true,
  },
  {
    name: 'next-auth.callback-url',
    purpose: 'Remembers which page to return you to after logging in.',
    duration: 'The browser session',
    strictlyNecessary: true,
  },
  {
    name: 'next-auth.state / next-auth.pkce.code_verifier',
    purpose:
      'Set only if you sign in with Google. They tie the response from Google back to the request you started, which is what stops that exchange being hijacked.',
    duration: 'A few minutes, during sign-in only',
    strictlyNecessary: true,
  },
]

/**
 * Things stored in the browser that are not cookies — worth listing
 * because people reasonably ask about them, and because a reader checking
 * devtools will find them.
 */
export const LOCAL_STORAGE_ENTRIES = [
  {
    name: 'riglog-theme',
    purpose: 'Your light/dark/system choice (src/lib/theme.ts). Never sent to the server.',
  },
  {
    name: 'riglog-cookie-notice',
    purpose: 'Remembers that you have seen the cookie notice, so it stops reappearing.',
  },
  {
    name: 'riglog-trail-recording',
    purpose:
      'A crash-recovery copy of a GPS track while you are recording one, so closing the tab by accident does not lose the run. Cleared once the run is saved.',
  },
]

export interface SubProcessor {
  name: string
  purpose: string
  /** What actually leaves this app and reaches them. */
  dataShared: string
  /** Only set when it's conditional on a feature or configuration. */
  when?: string
}

/**
 * Every third party that receives user data, derived from the outbound
 * calls in the codebase rather than from memory.
 */
export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: 'Vercel',
    purpose: 'Hosting, and Blob storage for uploaded photos, receipts and documents.',
    dataShared:
      'Everything the app stores, plus the usual server-log data (IP address, browser user agent, requested URL).',
  },
  {
    name: 'The database host',
    purpose: 'The Postgres database itself.',
    dataShared: 'Everything the app stores.',
  },
  {
    name: 'Stripe',
    purpose: 'Payments for RigLog Pro and for donations.',
    dataShared:
      'Your email address and the payment details you enter on Stripe’s own checkout page. Card numbers never reach RigLog — we store only Stripe’s customer and subscription identifiers.',
    when: 'Only if you buy Pro or donate.',
  },
  {
    name: 'Brevo, or Resend',
    purpose: 'Sending transactional email — password resets and the notifications you opted into.',
    dataShared: 'Your email address and the contents of that message.',
    when: 'Whichever is configured for this deployment.',
  },
  {
    name: 'Google',
    purpose: 'Sign in with Google.',
    dataShared: 'Google tells us your email address and name. We do not receive your Google password.',
    when: 'Only if you use that sign-in option.',
  },
  {
    name: 'OpenStreetMap',
    purpose: 'Map tiles on the trail log.',
    dataShared:
      'Your browser requests map images directly from openstreetmap.org, so it sees your IP address and which part of the map you are looking at.',
    when: 'Only on trail log pages, which are off-road projects only.',
  },
  {
    name: 'unpkg',
    purpose: 'Serves the map’s marker icons.',
    dataShared: 'Your IP address, as with any image loaded from another site.',
    when: 'Only on pages showing a map.',
  },
  {
    name: 'NHTSA vPIC (US Department of Transportation)',
    purpose: 'Decoding a VIN when the built-in table does not recognise it.',
    dataShared: 'The VIN you asked to decode. Nothing identifying you is sent with it.',
    when: 'Only when you use the VIN decoder.',
  },
  {
    name: 'Your browser’s push service (Google, Mozilla, Apple, …)',
    purpose: 'Delivering web push notifications.',
    dataShared:
      'The notification’s contents, sent to the endpoint your browser gave us. Which service that is depends on your browser.',
    when: 'Only if you turn push notifications on.',
  },
]

export interface RetentionEntry {
  what: string
  howLong: string
}

/**
 * What survives account deletion, and why. Checked against the schema's
 * cascade rules and the DELETE handlers — see src/lib/personalData.ts.
 */
export const RETENTION: RetentionEntry[] = [
  {
    what: 'Your account, vehicles, tasks, photos, documents, wishlist, trail logs and collaborator invitations',
    howLong:
      'Until you delete them, or until you delete your account — at which point they are removed immediately, including the uploaded files themselves.',
  },
  {
    what: 'Feedback tickets, votes, comments, and parts-wanted posts',
    howLong: 'Deleted with your account. They disappear from the public board too.',
  },
  {
    what: 'Donation records',
    howLong:
      'Kept after account deletion, with your account detached from them. A payment that happened is an accounting record; what is removed is the link to you.',
  },
  {
    what: 'Password reset tokens',
    howLong: 'One hour, then they stop working. Deleted with your account.',
  },
  {
    what: 'Rate-limiting counters, which stop brute-force and spam',
    // Checked against src/lib/rateLimit.ts: the key is plain text, of the
    // form `login:email:<address>` or `register:ip:<address>`. Saying
    // "anonymous counters" would be false.
    howLong:
      'At most an hour, after which they are swept away. Depending on what is being limited, the counter’s key contains an email address or an IP address alongside the count.',
  },
]
