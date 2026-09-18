/**
 * Cloudflare Turnstile — the bot check on the three forms a stranger can
 * POST to without an account.
 *
 * ## Why this and not the rate limiter
 *
 * They stop different things and neither replaces the other. The limiter
 * (src/lib/rateLimit.ts) counts requests against a key, so it blunts
 * volume from one address or against one account. It is useless against
 * the cheap modern shape of this abuse: a few hundred residential proxies
 * doing three requests each, every one of them under every budget.
 * Turnstile prices the *request itself* instead of the rate.
 *
 * ## Why Turnstile rather than a CAPTCHA
 *
 * Nobody solves a puzzle. It is usually invisible, it needs no account
 * with Google, it is free at any volume, and Cloudflare states it neither
 * sets tracking cookies nor profiles visitors — which matters here
 * because this app has no analytics, no advertising and a cookie page
 * that claims every cookie is strictly necessary. A widget that started
 * tracking people would have to be disclosed as something other than what
 * that page says. It is in SUB_PROCESSORS either way.
 *
 * ## The other half of "Cloudflare protection"
 *
 * This module is the part that lives in the app. The bigger part — the
 * proxy in front of the origin, WAF rules, DDoS absorption, Bot Fight
 * Mode — is DNS and dashboard configuration that no code in this
 * repository can perform. See DEPLOY.md, "Cloudflare".
 *
 * The browser's half — the script URL and the public site key — lives in
 * turnstileClient.ts, so that nothing here reaches a client bundle.
 */

import { turnstileSiteKey } from './turnstileClient'

export { turnstileSiteKey }

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** How long to wait on Cloudflare before treating it as unreachable. */
const VERIFY_TIMEOUT_MS = 5000

function turnstileSecret(): string | null {
  return process.env.TURNSTILE_SECRET_KEY || null
}

/**
 * Whether the check is actually on. It takes **both** keys.
 *
 * Half-configured is the dangerous state and it is treated as off rather
 * than half-on, in both directions:
 *
 * - site key without secret: the widget renders and every token it issues
 *   would have to be waved through unverified. Security theatre that
 *   looks like protection is worse than no protection, because it is what
 *   an operator points at when asked whether the forms are protected.
 * - secret without site key: no widget renders, so no form can ever
 *   produce a token, so enforcing would refuse every signup and login on
 *   the site. A missing environment variable must not be able to lock
 *   everybody out.
 *
 * Neither state is silent — `turnstileConfigProblem()` puts it on
 * /admin/diagnostics.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(turnstileSiteKey() && turnstileSecret())
}

/** The half-configured states, for the diagnostics screen. */
export function turnstileConfigProblem(): 'secretMissing' | 'siteKeyMissing' | null {
  const site = turnstileSiteKey()
  const secret = turnstileSecret()
  if (site && !secret) return 'secretMissing'
  if (secret && !site) return 'siteKeyMissing'
  return null
}

export type TurnstileOutcome =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: 'missingToken' | 'rejected'; errorCodes: string[] }

/**
 * Checks a token with Cloudflare.
 *
 * ## Tokens are single-use
 *
 * Cloudflare rejects a second presentation of the same token with
 * `timeout-or-duplicate`. That is not an edge case on a login form: the
 * first attempt spends the token, so a mistyped password followed by a
 * corrected one fails the *check* rather than the password unless the
 * widget is reset between submissions. `TurnstileWidget` resets itself on
 * every submit for exactly this reason.
 *
 * ## Unreachable Cloudflare is allowed through
 *
 * Deliberate, and the same call the rate limiter makes about an
 * unreachable database. If this network hop is down, failing closed takes
 * registration, login and password reset offline for everyone — a
 * third-party outage converted into a total outage of the app's front
 * door. Failing open loses the bot check for the duration and keeps the
 * rate limits, which are local and still running.
 *
 * The narrow cost is that whoever can sever this one egress path turns
 * the check off. Someone with that position has far better options.
 * A rejection Cloudflare actually issues is never waved through — only
 * the absence of an answer is.
 *
 * ## A missing token is still a refusal, and that limit is real
 *
 * The fail-open above covers siteverify being unreachable while widgets
 * still work. It does **not** cover a visitor whose browser cannot load
 * the widget at all — an ad blocker, a corporate filter, a country-level
 * block, or Cloudflare being down outright. Those produce no token, and
 * no token is refused here.
 *
 * That is not an oversight, it is the only honest option: the request
 * cannot tell the server why it has no token, and accepting one that
 * merely *claims* the widget was blocked would accept whatever a script
 * chose to claim, which is the entire check. The cost is that such a
 * visitor cannot sign in while Turnstile is switched on, so
 * `TurnstileWidget` tells them which of the two it is and what to try,
 * and clearing the two keys is the operator's lever if it turns out to
 * affect real people. DEPLOY.md 6.9 says so.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string
): Promise<TurnstileOutcome> {
  if (!isTurnstileConfigured()) return { ok: true, skipped: true }

  if (typeof token !== 'string' || token.trim() === '') {
    return { ok: false, reason: 'missingToken', errorCodes: [] }
  }

  const body = new URLSearchParams({ secret: turnstileSecret()!, response: token })
  // Only sent when it is a real address: 'unknown' is what clientIp()
  // returns when it has nothing, and Cloudflare answers
  // `bad-request` to a malformed remoteip rather than ignoring it.
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp)

  let data: { success?: boolean; 'error-codes'?: string[] }
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[turnstile] siteverify answered ${res.status}; allowing the request through.`)
      return { ok: true, skipped: true }
    }
    data = await res.json()
  } catch (e) {
    console.error('[turnstile] could not reach siteverify; allowing the request through:', e)
    return { ok: true, skipped: true }
  }

  if (data.success === true) return { ok: true, skipped: false }

  const errorCodes = Array.isArray(data['error-codes']) ? data['error-codes'] : []
  // Logged with Cloudflare's own codes, because the two that actually
  // happen need opposite responses from the operator:
  // `invalid-input-secret` means TURNSTILE_SECRET_KEY is wrong and every
  // visitor is being refused, while `timeout-or-duplicate` means a widget
  // somewhere is reusing a token.
  console.error(`[turnstile] rejected: ${errorCodes.join(', ') || 'no error code given'}`)
  return { ok: false, reason: 'rejected', errorCodes }
}
