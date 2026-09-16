/**
 * Language selection for the app: Romanian (default) and English.
 *
 * ## Why the locale is not in the URL
 *
 * next-intl's other mode puts the locale in the path (`/en/dashboard`).
 * That buys per-language indexing and static rendering, and costs a
 * `[locale]` segment in front of all 48 pages plus a locale-aware `Link`
 * in all 161 places one is used — every public build URL, the sitemap,
 * every share link, every absolute URL in an email. This app is
 * overwhelmingly a signed-in tool: 35 of its 48 pages already render
 * dynamically because they read the session, so the static rendering that
 * routing would preserve only ever applied to about ten pages.
 *
 * So the choice is a cookie, read per request. No URL changes, nothing to
 * keep in sync, and an existing indexed link keeps working exactly as it
 * did. The trade-off is real and worth stating: the public build profiles
 * are one URL serving whichever language the reader picked, not two
 * separately indexed pages.
 *
 * ## Two stores, on purpose
 *
 * The cookie is what the UI renders from — it is per browser, and it is
 * readable without a session, which the homepage and the public profiles
 * need. `User.locale` is what *email* renders from, because a reminder is
 * sent from a cron job hours later with no browser anywhere near it.
 * `LanguageToggle` writes both. They can disagree (a signed-in user on a
 * borrowed laptop), and that is the correct outcome for each: the screen
 * follows the browser, the mail follows the account.
 *
 * Unlike the theme (localStorage, see src/lib/theme.ts) this has to be a
 * cookie: the server renders the text, so it has to know the language
 * before it replies. It is strictly necessary and carries no identifier —
 * see SUB_PROCESSORS/COOKIES in src/lib/legal.ts, which lists it.
 */

export const LOCALES = ['ro', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/**
 * Romanian. The product is built for the Romanian market — its prices are
 * in RON, its document reminders are ITP/RCA, and its VIN decoder knows
 * the Mioveni plant codes.
 */
export const DEFAULT_LOCALE: Locale = 'ro'

/** Names shown in the switcher, each written in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ro: 'Română',
  en: 'English',
}

/** Short form for the compact toggle. */
export const LOCALE_SHORT: Record<Locale, string> = {
  ro: 'RO',
  en: 'EN',
}

export const LOCALE_COOKIE = 'riglog-locale'

/** A year: the choice should outlive the session that made it. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Best match for an `Accept-Language` header, or null if it asks for
 * nothing we speak.
 *
 * Only consulted when the cookie is absent — one visit is enough to
 * replace this guess with an answer. Deliberately forgiving about the
 * header's shape (it is attacker-controlled like any request header, and
 * the worst a malformed one can do here is pick a language).
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)

  for (const { tag } of ranked) {
    // `ro-MD` and `en-GB` are still Romanian and English to us.
    const base = tag.split('-')[0]
    if (isLocale(base)) return base
  }

  return null
}

/** Coerces anything — a cookie, a form field, a database column — to a locale. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}
