import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import SettingsForm from '@/components/SettingsForm'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageToggle from '@/components/LanguageToggle'
import DataExportCard from '@/components/DataExportCard'
import InstallAppButton from '@/components/InstallAppButton'
import VerifyEmailResend from '@/components/VerifyEmailResend'
import { isEmailVerified, isVerificationEnforced } from '@/lib/emailVerification'

export default async function SettingsPage() {
  const t = await getTranslations('settings')
  const tc = await getTranslations('common')
  const td = await getTranslations('dashboard')
  const tl = await getTranslations('settings.language')
  const ti = await getTranslations('install')
  const tv = await getTranslations('verifyEmail')
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      id: true,
      avatarUrl: true,
      displayName: true,
      location: true,
      isPublicProfile: true,
      email: true,
      emailVerifiedAt: true,
      locale: true,
      isPro: true,
      isProComped: true,
      foundingNumber: true,
      proPlan: true,
      stripeCustomerId: true,
      notifyFollowedEmail: true,
      notifyFollowedPush: true,
    },
  })

  const verified = isEmailVerified(user)
  const enforced = isVerificationEnforced()
  // The account's own language, not the browser's: this is a date on a
  // record, and it reads oddly next to an address in one language and a
  // month in another.
  const verifiedOn = user.emailVerifiedAt
    ? new Intl.DateTimeFormat(user.locale === 'en' ? 'en-GB' : 'ro-RO', {
        dateStyle: 'long',
      }).format(user.emailVerifiedAt)
    : ''

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: td('title') })}
      </Link>
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

      {/* Always rendered, in both states. An unconfirmed address is worth
          saying out loud, and a confirmed one is worth being able to check
          — a card that appeared only when something was wrong would leave
          somebody who had just clicked the link with no way to tell
          whether it worked. */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">{tv('settingsTitle')}</h2>
        <p className="text-sm text-ink">{user.email}</p>
        {verified ? (
          <p className="mt-1 text-xs text-ink-muted">
            {tv('verified', { date: verifiedOn })}
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-muted">{tv('unverified')}</p>
            {/* Which of the two sentences follows depends on whether the
                rule is actually being applied. Telling somebody their
                posting is held back, on a deployment that can never send
                them the link that would release it, would be describing a
                wall with no door. */}
            <p className="mt-2 text-xs text-ink-faint">
              {enforced ? tv('unverifiedHelp') : tv('notEnforced')}
            </p>
            {enforced && <VerifyEmailResend className="mt-3" />}
          </>
        )}
      </section>

      {/* Renders nothing at all on a browser that cannot install, or one
          where it already is — see InstallAppButton. */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">{ti('title')}</h2>
        <InstallAppButton />
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
