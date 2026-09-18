/**
 * The half of Turnstile the browser needs, split from the half it must
 * not have.
 *
 * `turnstile.ts` reads `TURNSTILE_SECRET_KEY` and calls Cloudflare's
 * siteverify endpoint. Next replaces a non-`NEXT_PUBLIC_` variable with
 * `undefined` in a client bundle, so importing that module from a
 * component would not leak the secret — but it would ship the verification
 * path to every visitor, where it can only ever be dead code that looks
 * like a security boundary. The widget imports this file instead.
 */

/**
 * `render=explicit` so the script draws nothing on its own. React owns
 * the container element, and a script that reached in and rendered into
 * it by itself would fight reconciliation.
 */
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * The public key that identifies the widget. Public by design — it is not
 * a credential, and the check is worthless without the secret half that
 * never leaves the server.
 *
 * Next substitutes `process.env.NEXT_PUBLIC_…` textually at build time,
 * so this has to stay a literal property access. A computed lookup would
 * survive typechecking and arrive as undefined in the browser, which
 * reads exactly like "Turnstile is switched off".
 */
export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null
}

/** Whether a form should render a widget at all. */
export function isTurnstileEnabledInBrowser(): boolean {
  return turnstileSiteKey() !== null
}
