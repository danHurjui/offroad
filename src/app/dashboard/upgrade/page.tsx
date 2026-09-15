import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import UpgradePlanCard from '@/components/UpgradePlanCard'

// RL-017: three purchase options — Monthly/Annual (recurring) and
// Lifetime (one-time). Each hits POST /api/billing/checkout and redirects
// to Stripe's hosted Checkout page.
export default async function UpgradePage() {
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { isPro: true } })
  if (user.isPro) redirect('/dashboard/settings')

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/settings" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">Upgrade to Pro</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Unlimited vehicles and photos, full cost analytics, PDF build history export, and more. Prices in RON.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UpgradePlanCard
          plan="MONTHLY"
          title="Monthly"
          price="14.99 RON"
          period="/ month"
          description="Cancel any time."
        />
        <UpgradePlanCard
          plan="ANNUAL"
          title="Annual"
          price="99 RON"
          period="/ year"
          description="Best value — under 8.25 RON/month."
          highlight
        />
        <UpgradePlanCard
          plan="LIFETIME"
          title="Lifetime"
          price="299 RON"
          period="once"
          description="Pay once, Pro forever."
        />
      </div>
    </div>
  )
}
