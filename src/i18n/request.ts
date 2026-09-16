import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from './config'
import { loadMessages } from './messages'

/**
 * Resolves the language for one request, in the order a person would
 * expect: what they chose, then what their browser asked for, then
 * Romanian.
 *
 * Reading the cookie makes the page dynamic, which is why this is the one
 * place that does it — see src/i18n/config.ts for why that cost is
 * acceptable here.
 */
export default getRequestConfig(async () => {
  const chosen = cookies().get(LOCALE_COOKIE)?.value

  const locale = isLocale(chosen)
    ? chosen
    : // No cookie yet: a first-time visitor whose browser asks for English
      // should get English rather than having to find the switcher first.
      localeFromAcceptLanguage(headers().get('accept-language')) ?? DEFAULT_LOCALE

  return {
    locale,
    messages: await loadMessages(locale),
    // Romanian formatting for both: prices are RON and dates are read in
    // Romania regardless of which language the interface is in.
    timeZone: 'Europe/Bucharest',
  }
})
