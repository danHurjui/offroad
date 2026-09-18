import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import Nav from '@/components/Nav'
import InstallPromptBanner from '@/components/InstallPromptBanner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tc = await getTranslations('common')
  const t = await getTranslations('dashboard')
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, displayName: true, avatarUrl: true, proPaymentFailedAt: true },
  })

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Visually hidden until focused — the first Tab on any page skips the
          header rather than walking through every nav link. */}
      <a href="#main" className="skip-link">
        {tc('skipToContent')}
      </a>
      <Nav
        userId={session.user.id}
        displayName={user?.displayName ?? t('accountFallback')}
        avatarUrl={user?.avatarUrl}
        isAdmin={session.user.isAdmin}
      />
      {/* Directly under the header, above everything else the page has to
          say — and it renders nothing unless the browser has actually
          offered an install and the person has not waved it away. */}
      <InstallPromptBanner />
      {user?.proPaymentFailedAt && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
          {t.rich('paymentFailed', {
            link: (chunks) => (
              <Link href="/dashboard/settings" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </div>
      )}
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
