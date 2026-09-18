import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'

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
}: {
  /** Site-relative, leading slash, no query string: '/demo'. */
  path: string
  title: string
  description: string
}): Promise<Metadata> {
  const locale = await getLocale()

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      siteName: 'RigLog',
      // The language this response is actually in. One URL serves
      // whichever language the reader picked (src/i18n/config.ts), so
      // there is no `alternateLocale` to declare.
      locale: locale === 'ro' ? 'ro_RO' : 'en_GB',
    },
    twitter: { card: 'summary', title, description },
  }
}
