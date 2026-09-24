import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_HEADER, fromEnglishPath, hasEnglishVersion } from '@/i18n/localeRoutes'

/**
 * The English addresses of the public pages (src/i18n/localeRoutes.ts):
 * `/en/demo` is served by `/demo` with the language fixed to English by a
 * request header. Only `/en` is matched, so nothing else in the app pays
 * for a middleware. An `/en` address with no English version (`/en/login`,
 * `/en/dashboard`) is left alone and 404s — it never existed.
 */
export function middleware(req: NextRequest) {
  const path = fromEnglishPath(req.nextUrl.pathname)
  if (path === null || !hasEnglishVersion(path)) return NextResponse.next()

  const url = req.nextUrl.clone()
  // The readable site map lives at /sitemap-page (next.config.mjs rewrites
  // /sitemap there); go straight to it rather than rely on rewrite order.
  url.pathname = path === '/sitemap' ? '/sitemap-page' : path
  const headers = new Headers(req.headers)
  headers.set(LOCALE_HEADER, 'en')
  return NextResponse.rewrite(url, { request: { headers } })
}

export const config = { matcher: ['/en', '/en/:path*'] }
