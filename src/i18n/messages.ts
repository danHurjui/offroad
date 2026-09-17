import type { AbstractIntlMessages } from 'next-intl'
import type { Locale } from './config'

/**
 * The message catalogue for a locale.
 *
 * A static switch rather than a template import (`./${locale}.json`) so
 * the bundler can see both files: a dynamic path defeats tree-shaking and
 * silently ships an empty catalogue if it cannot resolve at build time.
 */
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  switch (locale) {
    case 'en':
      return (await import('../../messages/en.json')).default
    case 'ro':
    default:
      return (await import('../../messages/ro.json')).default
  }
}
