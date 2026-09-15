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
      <Nav displayName={user?.displayName ?? 'Account'} />
      {user?.proPaymentFailedAt && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
          Your last RigLog Pro payment failed.{' '}
          <Link href="/dashboard/settings" className="underline">
            Update your payment method
          </Link>{' '}
          to keep Pro access.
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
