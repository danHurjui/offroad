import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import SettingsForm from '@/components/SettingsForm'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageToggle from '@/components/LanguageToggle'
import DataExportCard from '@/components/DataExportCard'

export default async function SettingsPage() {
  const t = await getTranslations('settings')
  const tl = await getTranslations('settings.language')
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      displayName: true,
      location: true,
      isPublicProfile: true,
      isPro: true,
      isProComped: true,
      foundingNumber: true,
      proPlan: true,
      stripeCustomerId: true,
      notifyFollowedEmail: true,
      notifyFollowedPush: true,
    },
  })

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('title')}</h1>

      {/* Appearance lives outside SettingsForm: the theme is a per-device
          browser preference, not part of the account, so it saves instantly
          to this device rather than travelling with the profile. */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">{t('appearance')}</h2>
        <p className="mb-3 text-xs text-ink-muted">{t('appearanceHelp')}</p>
        <ThemeToggle />
      </section>

      {/* Language sits beside appearance because it behaves the same way
          from here — it takes effect immediately and it is not part of
          the profile you save. It is not *only* per-device though: the
          choice is also recorded on the account so reminder emails arrive
          in the same language, which is what the second line says. */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">{tl('title')}</h2>
        <p className="mb-3 text-xs text-ink-muted">{tl('help')}</p>
        <LanguageToggle />
      </section>

      <SettingsForm profile={user} />

      {/* Below the profile form, above nothing — it belongs next to the
          delete-account button it is the counterpart to. */}
      <div className="mt-6">
        <DataExportCard />
      </div>
    </div>
  )
}
