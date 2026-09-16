import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import Nav from '@/components/Nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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
        Skip to content
      </a>
      <Nav displayName={user?.displayName ?? 'Account'} isAdmin={session.user.isAdmin} />
      {user?.proPaymentFailedAt && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
          Your last RigLog Pro payment failed.{' '}
          <Link href="/dashboard/settings" className="underline">
            Update your payment method
          </Link>{' '}
          to keep Pro access.
        </div>
      )}
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
