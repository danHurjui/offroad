import type { MetadataRoute } from 'next'

// RL-018: public build pages should be crawlable; everything else
// (dashboard, auth, the collaborator accept flow, API routes) requires a
// session anyway, but disallowing them explicitly saves crawl budget and
// keeps them out of search results even if a link leaks.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/builds/',
      disallow: ['/dashboard/', '/api/', '/collaborate/', '/login', '/register'],
    },
    sitemap: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/sitemap.xml`,
  }
}
