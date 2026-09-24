import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import Nav from '@/components/Nav'
import InstallPromptBanner from '@/components/InstallPromptBanner'
import EmailVerificationBanner from '@/components/EmailVerificationBanner'
import { isBlockedAsUnverified } from '@/lib/emailVerification'
import { showsBusiness } from '@/lib/organizations'
import { isOrgBillingConfigured } from '@/lib/stripe'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tc = await getTranslations('common')
  const t = await getTranslations('dashboard')
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      proPaymentFailedAt: true,
      emailVerifiedAt: true,
      isAdmin: true,
      orgBetaAt: true,
      _count: { select: { organizationMemberships: true } },
    },
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
        showBusiness={showsBusiness(user, user?._count.organizationMemberships ?? 0, isOrgBillingConfigured())}
      />
      {/* Directly under the header, above everything else the page has to
          say — and it renders nothing unless the browser has actually
          offered an install and the person has not waved it away. */}
      <InstallPromptBanner />
      {/* Decided here rather than in the component: whether the rule is
          being enforced at all depends on server-only configuration, and a
          banner telling somebody to open a link that this deployment
          cannot send would be asking for the impossible. */}
      {user && isBlockedAsUnverified(user) && <EmailVerificationBanner email={user.email} />}
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
