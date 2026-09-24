jest.mock('next/headers', () => ({ headers: jest.fn(), cookies: jest.fn() }))

import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { EN_PREFIX, LOCALE_HEADER, englishPath, fromEnglishPath, hasEnglishVersion } from '@/i18n/localeRoutes'
import { localeFromRequest } from '@/i18n/requestLocale'
import { middleware, config } from '@/middleware'
import { DEMO_CHAPTERS } from '@/lib/demoTour'

describe('which pages have an English address', () => {
  it('our own public pages do', () => {
    for (const p of ['/', '/demo', '/demo/fuel', '/donate', '/terms', '/privacy', '/cookies', '/sitemap']) {
      expect({ p, en: hasEnglishVersion(p) }).toEqual({ p, en: true })
    }
    for (const chapter of DEMO_CHAPTERS) expect(hasEnglishVersion(`/demo/${chapter.id}`)).toBe(true)
  })

  // Somebody's own words in one language, or behind a session.
  it('user content and the app do not', () => {
    for (const p of ['/builds/dan/samurai', '/tickets', '/tickets/t1', '/community', '/community/parts-wanted', '/login', '/dashboard', '/passport/x', '/demo/a/b']) {
      expect({ p, en: hasEnglishVersion(p) }).toEqual({ p, en: false })
    }
  })

  it('maps both ways', () => {
    expect(englishPath('/')).toBe(EN_PREFIX)
    expect(englishPath('/demo/fuel')).toBe('/en/demo/fuel')
    expect(fromEnglishPath('/en')).toBe('/')
    expect(fromEnglishPath('/en/')).toBe('/')
    expect(fromEnglishPath('/en/demo/')).toBe('/demo')
    expect(fromEnglishPath('/demo')).toBeNull()
    expect(fromEnglishPath('/english')).toBeNull()
  })
})

describe('the middleware', () => {
  const run = (url: string) => middleware(new NextRequest(`https://riglog.example${url}`))

  it('serves an English address from the page itself, with the language fixed', () => {
    const res = run('/en/demo/fuel?utm_source=x')
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://riglog.example/demo/fuel?utm_source=x')
    expect(res.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe('en')
  })

  it('sends /en to the homepage and /en/sitemap to the readable site map', () => {
    expect(run('/en').headers.get('x-middleware-rewrite')).toBe('https://riglog.example/')
    expect(run('/en/sitemap').headers.get('x-middleware-rewrite')).toBe('https://riglog.example/sitemap-page')
  })

  it('leaves an /en address with no English version alone, to 404', () => {
    for (const url of ['/en/login', '/en/dashboard', '/en/builds/dan/x']) {
      expect(run(url).headers.get('x-middleware-rewrite')).toBeNull()
    }
  })

  it('runs only on /en, so nothing else in the app pays for it', () => {
    expect(config.matcher).toEqual(['/en', '/en/:path*'])
  })
})

describe('the language of a request', () => {
  const setup = (header: string | null, cookie: string | undefined, accept: string | null = null) => {
    ;(headers as jest.Mock).mockReturnValue({ get: (k: string) => (k === LOCALE_HEADER ? header : k === 'accept-language' ? accept : null) })
    ;(cookies as jest.Mock).mockReturnValue({ get: () => (cookie ? { value: cookie } : undefined) })
  }

  it('an English address is English whatever the cookie says', () => {
    setup('en', 'ro')
    expect(localeFromRequest()).toBe('en')
  })

  it('without it, the cookie, then the browser, then Romanian — as before', () => {
    setup(null, 'en')
    expect(localeFromRequest()).toBe('en')
    setup(null, undefined, 'en-GB,en;q=0.9')
    expect(localeFromRequest()).toBe('en')
    setup(null, undefined)
    expect(localeFromRequest()).toBe('ro')
  })
})

describe('pages declare their language pair', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

  it('every page with an English address uses the metadata that declares it', () => {
    for (const f of ['src/app/page.tsx', 'src/app/demo/page.tsx', 'src/app/demo/[feature]/page.tsx', 'src/app/donate/page.tsx', 'src/app/terms/page.tsx', 'src/app/privacy/page.tsx', 'src/app/cookies/page.tsx']) {
      expect({ f, uses: read(f).includes('publicPageMetadata(') }).toEqual({ f, uses: true })
    }
    expect(read('src/app/sitemap-page/page.tsx')).toContain("languageAlternates('/sitemap')")
  })
})
