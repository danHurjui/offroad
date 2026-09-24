import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { englishPath, hasEnglishVersion } from '@/i18n/localeRoutes'
import { onEnglishAddress } from '@/i18n/localizedHref'

/**
 * The two addresses of a page that has an English version, as hreflang:
 * Romanian is the default (`x-default`) since that is the market and the
 * language a visitor with no preference gets. Empty for a page with one
 * address (a build, a ticket — somebody's own words in one language).
 */
export function languageAlternates(path: string): { languages?: Record<string, string> } {
  if (!hasEnglishVersion(path)) return {}
  return { languages: { ro: path, en: englishPath(path), 'x-default': path } }
}

/** This page's own address: its English one when that is how it was reached. */
export function canonicalFor(path: string): string {
  return onEnglishAddress() && hasEnglishVersion(path) ? englishPath(path) : path
}

/**
 * The metadata every public page wants, in one place.
 *
 * Three tags, and each was missing somewhere before this existed:
 *
 * - **A canonical.** These pages are reachable at more than one address
 *   in practice — with a `?utm_…` on the end of a shared link, with and
 *   without a trailing slash, and `/community` with any combination of
 *   its filters. Without a canonical each of those is a separate page as
 *   far as Search is concerned, competing with the others for the same
 *   query. Note what this means for `/community`: the canonical points at
 *   the unfiltered feed, deliberately, because a filtered view is the
 *   same content narrowed rather than a page of its own.
 * - **Open Graph.** A link to this site pasted into a chat used to render
 *   as a bare URL. The tour is a page people are meant to *send* to
 *   somebody, so the preview is the point.
 * - **A Twitter card**, which several other things read as a fallback.
 *
 * - **Its language pair** (src/i18n/localeRoutes.ts): a page with an
 *   English address declares both as hreflang alternates, and its
 *   canonical is the address it was reached on — `/en/demo` is its own
 *   page, not a duplicate of `/demo`.
 *
 * The root layout supplies `metadataBase`, which a relative `canonical`
 * and `url` resolve against. It also declares `openGraph`, but a page
 * setting its own **replaces** that object rather than merging into it —
 * which silently cost every page here its `og:site_name` and `og:locale`
 * until this restated them. Anything added to the layout's `openGraph`
 * has to be repeated here too, or it stops applying to exactly the pages
 * that most want it.
 */
export async function publicPageMetadata({
  path,
  title,
  description,
  image = '/og',
}: {
  /** Site-relative, leading slash, no query string: '/demo'. */
  path: string
  title: string
  description: string
  /** The link-preview picture (src/app/og/route.tsx); the homepage's unless a page has its own. */
  image?: string
}): Promise<Metadata> {
  const locale = await getLocale()
  // The picture in the page's own language: /og has no /en address, so it is told.
  const imageUrl = onEnglishAddress() ? `${image}${image.includes('?') ? '&' : '?'}lang=en` : image
  const images = [{ url: imageUrl, width: 1200, height: 630, alt: title }]

  return {
    title,
    description,
    alternates: { canonical: canonicalFor(path), ...languageAlternates(path) },
    openGraph: {
      title,
      description,
      url: canonicalFor(path),
      type: 'website',
      siteName: 'RigLog',
      // The language this response is actually in. One URL serves
      // whichever language the reader picked (src/i18n/config.ts), so
      // there is no `alternateLocale` to declare.
      locale: locale === 'ro' ? 'ro_RO' : 'en_GB',
      images,
    },
    // A large card now there is a picture worth showing.
    twitter: { card: 'summary_large_image', title, description, images },
  }
}
