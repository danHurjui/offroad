import type { MetadataRoute } from 'next'

// RL-018: public build pages should be crawlable, as are the marketing
// homepage, the community feed and the public roadmap. Everything else
// (dashboard, auth, the collaborator accept flow, API routes) requires a
// session anyway, but disallowing them explicitly saves crawl budget and
// keeps them out of search results even if a link leaks.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/builds/', '/community', '/tickets', '/donate', '/privacy', '/cookies'],
      // /donate/thanks carries a Stripe session id in the query string —
      // nothing to index, and no reason to have it crawled.
      disallow: [
        '/dashboard/',
        '/api/',
        '/collaborate/',
        '/login',
        '/register',
        '/donate/thanks',
        '/tickets/new',
      ],
    },
    sitemap: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/sitemap.xml`,
  }
}
