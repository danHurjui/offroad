import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import Nav from '@/components/Nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { displayName: true },
  })

  return (
    <div className="min-h-screen bg-surface-muted">
      <Nav displayName={user?.displayName ?? 'Account'} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
