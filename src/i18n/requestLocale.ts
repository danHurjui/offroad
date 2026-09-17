import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale, localeFromAcceptLanguage } from './config'

/**
 * The language this request should be answered in, in the order a person
 * would expect: what they chose, then what their browser asked for, then
 * Romanian.
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
  const chosen = cookies().get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  // No cookie yet: a first-time visitor whose browser asks for English
  // should get English rather than having to find the switcher first.
  return localeFromAcceptLanguage(headers().get('accept-language')) ?? DEFAULT_LOCALE
}
