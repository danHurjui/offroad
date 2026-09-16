import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import Providers from '@/components/Providers'
import KeyboardShortcuts from '@/components/KeyboardShortcuts'
import CookieNotice from '@/components/CookieNotice'
import { THEME_SCRIPT } from '@/lib/theme'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

/**
 * Async because the description is translated — the tab title and the
 * link preview should be in the reader's language too.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')

  return {
    title: 'RigLog',
    description: t('description'),
    // One SVG for every slot. Browsers scale it for the tab, iOS uses it
    // for the home-screen icon, and there is no PNG set to keep in sync.
    icons: {
      icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
      apple: [{ url: '/icons/icon.svg' }],
    },
  }
}

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
  const messages = await getMessages()

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
