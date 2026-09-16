/**
 * The app's own public origin, validated.
 *
 * Fourteen places used to write `process.env.NEXTAUTH_URL ?? 'http://
 * localhost:3000'` inline, which meant one bad environment variable
 * silently poisoned password-reset links, collaborator invitations,
 * follow notifications, price alerts, Stripe redirects, the sitemap and
 * every public build URL — with nothing anywhere to notice.
 *
 * That is not hypothetical: a deploy once had `NEXTAUTH_URL` set to a
 * base64 secret, and the reset emails went out linking to
 * `http://drrisq1f…echq=/reset-password?token=…`. `new URL()` is no help
 * there — the WHATWG parser accepts that string as a hostname without
 * complaint. Hence the explicit hostname check below.
 *
 * ## Why not read the request's Host header
 *
 * Because that is how password-reset poisoning works: an attacker sends a
 * forgot-password request with `Host: evil.com`, the victim receives a
 * genuine-looking email, and their real token lands on the attacker's
 * server. Every source here is configuration or platform-provided, never
 * request-provided.
 */

/**
 * Hostnames that are real: DNS labels separated by dots, or a bare name
 * like `localhost`. No `=`, no spaces, no underscores — which is exactly
 * what catches a secret pasted into the wrong variable.
 */
const HOSTNAME = /^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))*$/

function normalise(candidate: string | undefined, { assumeHttps = false } = {}): string | null {
  const raw = candidate?.trim()
  if (!raw) return null

  // Vercel hands out `VERCEL_URL` as a bare hostname, no scheme.
  const withScheme = assumeHttps && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!HOSTNAME.test(url.hostname)) return null

  // Origin only: a stray path would end up doubled in every link built
  // from this ("https://app.example/app/reset-password").
  return url.origin
}

/**
 * The origin to build absolute links with, or null when nothing usable is
 * configured.
 *
 * Outside production it falls back to localhost, because that is what a
 * developer means. In production it does **not** — an email linking to
 * localhost is worse than an email that was never sent, and returning
 * null lets the caller say so.
 */
export function resolveAppUrl(): string | null {
  const configured =
    normalise(process.env.NEXTAUTH_URL) ??
    // Set by Vercel itself, so it cannot be spoofed by a request. The
    // production alias first: VERCEL_URL is the per-deployment hostname
    // and changes on every push, which is wrong in an email that might be
    // opened a week later.
    normalise(process.env.VERCEL_PROJECT_PRODUCTION_URL, { assumeHttps: true }) ??
    normalise(process.env.VERCEL_URL, { assumeHttps: true })

  if (configured) return configured
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return null
}

export class AppUrlNotConfiguredError extends Error {
  constructor() {
    super(
      'No usable public URL. Set NEXTAUTH_URL to the full origin this app is served from ' +
        '(for example https://riglog.ro) — it must be a real http(s) URL, not a secret or a bare name.'
    )
    this.name = 'AppUrlNotConfiguredError'
  }
}

/**
 * The origin, or a throw. For callers that cannot produce anything
 * meaningful without one — a reset email, a Stripe redirect — and would
 * otherwise send a link to nowhere.
 */
export function requireAppUrl(): string {
  const url = resolveAppUrl()
  if (!url) throw new AppUrlNotConfiguredError()
  return url
}

/**
 * For notifications that run in the background. A broken link must not
 * take down the request that triggered it, but it must not be silent
 * either — the whole point of this module is that the old failure left no
 * trace anywhere.
 */
export function appUrlForNotification(context: string): string | null {
  const url = resolveAppUrl()
  if (!url) {
    console.error(
      `[appUrl] Skipping ${context}: no usable public URL configured. ` +
        'Set NEXTAUTH_URL to the origin this app is served from.'
    )
  }
  return url
}

/**
 * For metadata — sitemap, robots, canonical URLs. These are wrong rather
 * than dangerous without a real origin, and a page that throws is worse
 * than one carrying a placeholder a crawler will ignore.
 */
export function appUrlForMetadata(): string {
  return resolveAppUrl() ?? 'http://localhost:3000'
}
