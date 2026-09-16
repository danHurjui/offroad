import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import Nav from '@/components/Nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tc = await getTranslations('common')
  const t = await getTranslations('dashboard')
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { displayName: true, proPaymentFailedAt: true },
  })

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Visually hidden until focused — the first Tab on any page skips the
          header rather than walking through every nav link. */}
      <a href="#main" className="skip-link">
        {tc('skipToContent')}
      </a>
      <Nav displayName={user?.displayName ?? t('accountFallback')} isAdmin={session.user.isAdmin} />
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
