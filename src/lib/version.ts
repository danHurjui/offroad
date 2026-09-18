/**
 * Which build of RigLog this is — the one place that answers it.
 *
 * ## Why the values are inlined at build time
 *
 * `next.config.mjs` resolves the commit, the package version and the
 * build timestamp, and exposes them through `env` so Next substitutes
 * them textually into the bundle. That timing is the requirement, not a
 * convenience: this app is a PWA with a service worker, so the code in
 * somebody's browser can be older than the code on the server. A version
 * read at request time would cheerfully report the current deploy to a
 * person whose tab is running last week's bundle, which is exactly the
 * confusion this module exists to end.
 *
 * Because the substitution is textual, **every read below has to be a
 * literal `process.env.NEXT_PUBLIC_…` property access**. A computed
 * lookup type-checks, passes review, and arrives `undefined` in the
 * browser — the same trap as the Turnstile site key.
 *
 * ## Why there is no fallback value
 *
 * A build with no git history, or a tarball export, genuinely does not
 * know its commit. Printing `0.0.0` or `dev` there would put a number in
 * front of somebody that they will quote back in a bug report as fact.
 * `unknown` is less useful and more true, and `isBuildKnown()` lets the
 * screens say so in their own words.
 *
 * ## What identifies a build
 *
 * The **commit**, not the semver. `package.json`'s version is a label a
 * human has to remember to bump, and the repository already has one
 * constant that rots exactly that way (`LEGAL_LAST_UPDATED`). The sha
 * moves on its own with every deploy and cannot drift from what shipped,
 * so it is what the cache name, the update check and a bug report key on.
 * The semver rides along as a friendly name when someone has set one.
 */

/** The `version` field of package.json at build time, or null. */
export const APP_VERSION: string | null = process.env.NEXT_PUBLIC_APP_VERSION || null

/** Short commit this bundle was built from, or null when git was unavailable. */
export const BUILD_SHA: string | null = process.env.NEXT_PUBLIC_BUILD_SHA || null

/** ISO timestamp of the build, or null. */
export const BUILD_TIME: string | null = process.env.NEXT_PUBLIC_BUILD_TIME || null

/**
 * The stable identifier for this build, used by anything that has to tell
 * two builds apart: the service-worker cache name, the update check, and
 * the version attached to a bug report.
 *
 * Deliberately falls back to the build timestamp when there is no commit,
 * and only then to `unknown`. A timestamp is a poor name but a correct
 * discriminator — two builds minutes apart still differ, so the cache
 * eviction below keeps working on a deployment with no git history.
 */
export function buildId(): string {
  return BUILD_SHA ?? (BUILD_TIME ? `t${Date.parse(BUILD_TIME) || 0}` : 'unknown')
}

/** Whether we actually know what this build is. */
export function isBuildKnown(): boolean {
  return BUILD_SHA !== null
}

/**
 * What to show a person: `0.1.0 · a1b2c3d`, or as much of it as is true.
 *
 * Returns null when nothing is known, so a caller renders its own
 * "unknown" sentence from the catalogue rather than this module inventing
 * an English one — the screens are bilingual and this is not.
 */
export function versionLabel(): string | null {
  const parts = [APP_VERSION, BUILD_SHA].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Longest a client-reported version may be once stored. */
export const REPORTED_VERSION_MAX = 64

/**
 * Cleans a version string that arrived from a browser.
 *
 * A bug report carries the build **the reporter's tab was running**,
 * which only that tab knows — the server's own version is a different
 * fact, and on a stale cache the two disagree. That makes this value
 * genuinely useful and also entirely untrusted: it is a string somebody
 * can put anything into.
 *
 * It is not a privilege claim, so unlike `TicketComment.isStaff` it is
 * allowed to come from the request body at all. What it is not allowed to
 * be is unbounded, or anything but the shape a version has — it ends up
 * rendered on an admin screen next to text the same person wrote.
 */
export function sanitizeReportedVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Letters, digits, and the separators a version or a sha can contain.
  const cleaned = trimmed.replace(/[^A-Za-z0-9._· -]/g, '')
  const capped = cleaned.slice(0, REPORTED_VERSION_MAX).trim()
  return capped || null
}
