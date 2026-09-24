import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale, localeFromAcceptLanguage } from './config'
import { LOCALE_HEADER } from './localeRoutes'

/**
 * The language this request should be answered in, in the order a person
 * would expect: the address (an `/en` page), what they chose, then what
 * their browser asked for, then Romanian.
 *
 * One implementation, used twice. next-intl's request config calls it to
 * decide what a *page* renders as; a Route Handler calls it directly when
 * it needs the same answer without a React render — the PDF exports,
 * which are generated for whoever pressed the button and so follow the
 * browser rather than an account column.
 *
 * Reading the cookie is what makes a page dynamic; see src/i18n/config.ts
 * for why that cost was accepted.
 */
export function localeFromRequest(): Locale {
  try {
    // An English address (/en/…) is English whoever reads it — the
    // middleware sets this. Only a language, so a client sending it
    // itself on another page gains nothing but English.
    const fixed = headers().get(LOCALE_HEADER)
    if (isLocale(fixed)) return fixed

    const chosen = cookies().get(LOCALE_COOKIE)?.value
    if (isLocale(chosen)) return chosen

    // No cookie yet: a first-time visitor whose browser asks for English
    // should get English rather than having to find the switcher first.
    return localeFromAcceptLanguage(headers().get('accept-language')) ?? DEFAULT_LOCALE
  } catch {
    // No request scope. In production that cannot happen inside a route
    // handler or a render; it happens in the unit tests, which invoke
    // handlers directly with a hand-built request (CLAUDE.md pitfall #8)
    // and do not care which language an error comes back in. Throwing
    // here would turn every one of those into a 500 and hide whatever
    // they were actually testing.
    return DEFAULT_LOCALE
  }
}
