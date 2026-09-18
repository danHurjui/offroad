import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import Providers from '@/components/Providers'
import KeyboardShortcuts from '@/components/KeyboardShortcuts'
import CookieNotice from '@/components/CookieNotice'
import { THEME_SCRIPT } from '@/lib/theme'
import { messagesForClient } from '@/i18n/config'
import { appUrlForMetadata } from '@/lib/appUrl'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

/**
 * Async because the description is translated — the tab title and the
 * link preview should be in the reader's language too.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  const locale = await getLocale()

  return {
    /**
     * Every relative URL in any page's metadata resolves against this.
     *
     * Without it Next emits `<link rel="canonical" href="/sitemap">` and
     * resolves social-preview URLs against `localhost:3000`. A relative
     * canonical happens to work — a crawler resolves it against the page
     * it found — but an image URL pointing at localhost does not, and a
     * canonical is the one tag that must never be ambiguous, because
     * getting it wrong tells Search the wrong page is the real one.
     *
     * `appUrlForMetadata()` is the same resolver the sitemap and
     * robots.txt use, so all three agree on what this site's address is.
     */
    metadataBase: new URL(appUrlForMetadata()),
    title: 'RigLog',
    description: t('description'),
    // One SVG for every slot. Browsers scale it for the tab, iOS uses it
    // for the home-screen icon, and there is no PNG set to keep in sync.
    icons: {
      icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
      apple: [{ url: '/icons/icon.svg' }],
    },
    /**
     * Shared link-preview defaults. A page that sets its own `openGraph`
     * merges over these rather than replacing them, so `siteName` and the
     * locale are stated once.
     *
     * `locale` is the one the reader's cookie selected, which is the
     * language this response is actually in — the site serves one URL per
     * page in whichever language was picked (src/i18n/config.ts), so
     * there is no alternate to declare here either.
     */
    openGraph: {
      type: 'website',
      siteName: 'RigLog',
      locale: locale === 'ro' ? 'ro_RO' : 'en_GB',
      title: 'RigLog',
      description: t('description'),
    },
    twitter: { card: 'summary', title: 'RigLog', description: t('description') },
  }
}

/**
 * The language comes from a cookie (src/i18n/config.ts), and reading a
 * cookie is by definition per-request — so nothing under this layout can
 * be prerendered at build time. Declaring it here rather than on each
 * route says so once: without it Next tries to prerender the handful of
 * pages that do not read the session, and each fails with "used
 * `headers`" instead of simply rendering per request.
 *
 * This is the cost of the cookie, and it was priced in: 35 of the app's
 * 48 pages already rendered dynamically because they read the session.
 * `/robots.txt` and `/sitemap.xml` are route handlers outside this
 * layout and stay as they were.
 */
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved from the cookie (src/i18n/request.ts). It has to reach <html
  // lang>, or a screen reader announces Romanian copy with English
  // phonetics and the browser offers to translate a page that is already
  // in the reader's language.
  const locale = await getLocale()
  // Trimmed before it crosses to the browser: the provider serialises
  // whatever it is given into every page's HTML, and the legal, email and
  // notification namespaces only ever render on the server.
  const messages = messagesForClient(await getMessages())

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Runs before first paint so a dark-theme user never sees a white
            flash while React hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F2F4F6" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B0E12" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RigLog" />
      </head>
      <body className="font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <KeyboardShortcuts />
            <CookieNotice />
          </Providers>
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
