import { createTranslator } from 'next-intl'
import type { Locale } from './config'
import { loadMessages } from './messages'

/**
 * A translator for an explicit locale, built without a request context.
 *
 * `getTranslations()` from `next-intl/server` resolves the locale through
 * the request — the cookie, in this app — and needs React's server
 * context to do it. That is right for a page and wrong for everything
 * here: a document reminder is composed by a nightly cron job, a
 * follow-up notification by a background write, and each renders in the
 * *recipient's* language rather than the request's. Threading a request
 * context into those paths to reach a language we already know would be
 * backwards, and it is what made the email builders untestable outside a
 * server render.
 *
 * So this loads the catalogue and builds the translator directly. Same
 * ICU engine, same messages, no ambient state — which also means the
 * builders can be exercised in a plain unit test.
 */
export async function translator(locale: Locale, namespace: string) {
  return createTranslator({ locale, messages: await loadMessages(locale), namespace })
}
