import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatRon } from '@/lib/donations'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('donate'))('thanksTitle'), robots: { index: false } }
}

export const dynamic = 'force-dynamic'

/**
 * Stripe redirects here with the Checkout session id. That id is only used
 * to look up and display the amount — reaching this page is not proof of
 * payment, so it never marks anything PAID. The webhook does that, and it
 * may not have landed yet, which is why the copy doesn't promise the
 * donation is already settled.
 */
export default async function DonateThanksPage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  const t = await getTranslations('donate')
  const sessionId = searchParams.session_id
  const donation = sessionId
    ? await prisma.donation.findUnique({
        where: { stripeSessionId: sessionId },
        select: { amountBani: true, status: true },
      })
    : null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-20 text-center">
        <h1 className="text-3xl font-bold text-ink">{t('thanksTitle')}</h1>
        {donation ? (
          <p className="mt-4 text-ink-muted">
            {t('thanksWithAmount', { amount: formatRon(donation.amountBani) })}
            {donation.status === 'PENDING' && t('thanksPending')}
          </p>
        ) : (
          <p className="mt-4 text-ink-muted">
            {t('thanksGeneric')}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-faint">
          {t('receiptEmailed')}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-secondary">
            {t('backHome')}
          </Link>
          <Link href="/tickets" className="btn-primary">
            {t('tellUsNext')}
          </Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
