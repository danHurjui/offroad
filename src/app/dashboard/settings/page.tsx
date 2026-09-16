import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import SettingsForm from '@/components/SettingsForm'
import ThemeToggle from '@/components/ThemeToggle'

export default async function SettingsPage() {
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      displayName: true,
      location: true,
      isPublicProfile: true,
      isPro: true,
      isProComped: true,
      proPlan: true,
      stripeCustomerId: true,
      notifyFollowedEmail: true,
      notifyFollowedPush: true,
    },
  })

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Profile &amp; settings</h1>

      {/* Appearance lives outside SettingsForm: the theme is a per-device
          browser preference, not part of the account, so it saves instantly
          to this device rather than travelling with the profile. */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Appearance</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Applies to this device only. &ldquo;System&rdquo; follows your phone or computer&rsquo;s
          light/dark setting.
        </p>
        <ThemeToggle />
      </section>

      <SettingsForm profile={user} />
    </div>
  )
}
