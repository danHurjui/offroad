import { getLocale, getTranslations } from 'next-intl/server'
import { DEFAULT_LOCALE } from '@/i18n/config'

/**
 * The precedence note on a translated legal page.
 *
 * The privacy policy, the cookie policy and the terms are a contract and
 * a set of legal representations, and two languages of one document can
 * drift — a translator's word choice is not a redraft, but a reader who
 * relies on the looser of the two has a real argument. Saying up front
 * which version governs is what closes that, and it is the ordinary
 * practice for a bilingual policy.
 *
 * English is the authoritative version. Shown only on the *other*
 * language: telling an English reader that the English text governs is
 * noise, and it is why this renders nothing rather than a self-referential
 * banner.
 *
 * Deliberately not `hidden`/`sr-only` for the default locale — an
 * invisible legal disclosure is not a disclosure.
 */
export default async function LegalTranslationNote() {
  const locale = await getLocale()
  // The authoritative language needs no note about itself.
  if (locale === 'en') return null

  const t = await getTranslations('legalPages')

  return (
    <p className="card note mb-8 p-3 text-sm text-ink" lang={DEFAULT_LOCALE === locale ? locale : undefined}>
      {t('authoritative')}
    </p>
  )
}
