import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale, localeFromAcceptLanguage } from './config'
import { loadMessages } from './messages'

/**
 * Resolves the language for one request.
 *
 * Reading the cookie makes the page dynamic, which is why this is the one
 * place that does it — see src/i18n/config.ts for why that cost is
 * acceptable here.
 */
export default getRequestConfig(async ({ locale: requested }) => {
  // An explicit locale means a caller asked for one: an email builder
  // calling `getTranslations({ locale })`, which has to render in the
  // *recipient's* language rather than that of whoever (or whatever cron
  // job) triggered the send. Honouring it here is what makes `User.locale`
  // mean anything.
  const locale = isLocale(requested) ? requested : localeFromBrowser()

  return {
    locale,
    messages: await loadMessages(locale),
    // Romanian formatting in both languages: prices are RON and dates are
    // read in Romania regardless of which language the interface is in.
    timeZone: 'Europe/Bucharest',
  }
})

/**
 * The browser's answer, in the order a person would expect: what they
 * chose, then what their browser asked for, then Romanian.
 */
function localeFromBrowser(): Locale {
  const chosen = cookies().get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  // No cookie yet: a first-time visitor whose browser asks for English
  // should get English rather than having to find the switcher first.
  return localeFromAcceptLanguage(headers().get('accept-language')) ?? DEFAULT_LOCALE
}
