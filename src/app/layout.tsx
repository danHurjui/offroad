import type { Metadata, Viewport } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import KeyboardShortcuts from '@/components/KeyboardShortcuts'
import { THEME_SCRIPT } from '@/lib/theme'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

export const metadata: Metadata = {
  title: 'RigLog',
  description: 'Off-road build tracker & restoration journal',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
        <Providers>
          {children}
          <KeyboardShortcuts />
        </Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
