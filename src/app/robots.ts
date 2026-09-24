import type { MetadataRoute } from 'next'
import { appUrlForMetadata } from '@/lib/appUrl'

// RL-018: public build pages should be crawlable, as are the marketing
// homepage, the community feed and the public roadmap. Everything else
// (dashboard, auth, the collaborator accept flow, API routes) requires a
// session anyway, but disallowing them explicitly saves crawl budget and
// keeps them out of search results even if a link leaks.
/**
 * Resolved per request, not baked into the build.
 *
 * Without this, the `Sitemap:` line captures whatever origin was resolvable
 * at build time — which is localhost anywhere the build runs without the
 * environment set, and a robots.txt pointing at
 * `http://localhost:3000/sitemap.xml` sends Search Console somewhere it
 * cannot reach. sitemap.ts is dynamic for the same reason; this file was
 * simply missed.
 */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // /en: the English addresses of the public pages (src/i18n/localeRoutes.ts).
      allow: ['/', '/en', '/demo', '/builds/', '/community', '/tickets', '/donate', '/terms', '/privacy', '/cookies', '/sitemap'],
      // /donate/thanks carries a Stripe session id in the query string —
      // nothing to index, and no reason to have it crawled.
      disallow: [
        '/dashboard/',
        '/api/',
        '/collaborate/',
        '/organizations/',
        '/login',
        '/register',
        // The other two auth screens. /reset-password carries a token in
        // the query string, which is reason enough on its own.
        '/forgot-password',
        '/reset-password',
        '/donate/thanks',
        // RL-049: a shared passport's URL is its only credential. The page
        // is noindex too; this keeps crawlers from fetching one at all.
        '/passport/',
        // The compose screens. Both need a session, and posting a parts
        // request needs Pro — a crawler indexing either finds a login
        // wall, which Search Console reports as a soft 404.
        '/tickets/new',
        '/community/parts-wanted/new',
      ],
    },
    sitemap: `${appUrlForMetadata()}/sitemap.xml`,
  }
}
