/**
 * English addresses for the public pages, so Search can index both
 * languages: `/demo` is Romanian, `/en/demo` is the same page in English.
 *
 * Everything else about language stays as src/i18n/config.ts describes —
 * a cookie, read per request — for the signed-in app, where nothing is
 * indexed. Only the pages a stranger can read without an account get a
 * second address, and only those whose content is ours: a build page, a
 * ticket or a parts request is somebody's own words in one language, so a
 * second URL would be the same text twice.
 *
 * `src/middleware.ts` rewrites `/en/…` to the page itself and sets
 * `LOCALE_HEADER`, which `localeFromRequest()` reads before the cookie —
 * so an English address is English for everyone, crawler included, and a
 * Romanian one follows the reader's choice exactly as before.
 *
 * Pure and dependency-free: the middleware runs on the edge.
 */

export const EN_PREFIX = '/en'

/** Set by the middleware on an `/en` address; read before the cookie. */
export const LOCALE_HEADER = 'x-riglog-locale'

const ENGLISH_PAGES = [/^\/$/, /^\/demo$/, /^\/demo\/[A-Za-z]+$/, /^\/donate$/, /^\/terms$/, /^\/privacy$/, /^\/cookies$/, /^\/sitemap$/]

/** A public page of ours that also has an English address. */
export function hasEnglishVersion(path: string): boolean {
  return ENGLISH_PAGES.some((pattern) => pattern.test(path))
}

/** `/demo` → `/en/demo`, `/` → `/en`. */
export function englishPath(path: string): string {
  return path === '/' ? EN_PREFIX : `${EN_PREFIX}${path}`
}

/** `/en/demo` → `/demo`; null for anything not under `/en`. */
export function fromEnglishPath(pathname: string): string | null {
  if (pathname === EN_PREFIX || pathname === `${EN_PREFIX}/`) return '/'
  if (!pathname.startsWith(`${EN_PREFIX}/`)) return null
  return pathname.slice(EN_PREFIX.length).replace(/\/$/, '') || '/'
}
