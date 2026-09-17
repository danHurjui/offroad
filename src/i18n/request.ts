import { getRequestConfig } from 'next-intl/server'
import { isLocale } from './config'
import { loadMessages } from './messages'
import { localeFromRequest } from './requestLocale'

/**
 * Resolves the language for one request.
 *
 * Reading the cookie makes the page dynamic, which is why this is the one
 * place that does it — see src/i18n/config.ts for why that cost is
 * acceptable here.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale`, not the `locale` parameter. next-intl deprecated the
  // latter, and its getter falls back to the locale the *middleware* put
  // in a header — there is no middleware here, so merely destructuring it
  // calls notFound() and every page 404s. `requestLocale` resolves to
  // undefined in that case, which is what this needs.
  //
  // It is set when a caller asked for a specific language:
  // `getTranslations({ locale })` from an email builder, which has to
  // render in the *recipient's* language rather than that of whoever (or
  // whatever cron job) triggered the send. Honouring it here is what
  // makes `User.locale` mean anything.
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : localeFromRequest()

  return {
    locale,
    messages: await loadMessages(locale),
    // Romanian formatting in both languages: prices are RON and dates are
    // read in Romania regardless of which language the interface is in.
    timeZone: 'Europe/Bucharest',
  }
})
