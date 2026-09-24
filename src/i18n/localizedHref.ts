import { headers } from 'next/headers'
import { LOCALE_HEADER, englishPath, hasEnglishVersion } from './localeRoutes'

/** Whether this request came in on an English address (`/en/…`). */
export function onEnglishAddress(): boolean {
  try {
    return headers().get(LOCALE_HEADER) === 'en'
  } catch {
    return false
  }
}

/**
 * A link from a public page: on an English address, to the English
 * address of a page that has one, so a crawler (and a reader) that came in
 * through `/en` stays in English; everywhere else, the path unchanged.
 */
export function localizedHref(path: string): string {
  return onEnglishAddress() && hasEnglishVersion(path) ? englishPath(path) : path
}
