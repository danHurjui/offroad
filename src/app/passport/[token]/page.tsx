import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import PublicHeader from '@/components/PublicHeader'
import PassportDocument from '@/components/PassportDocument'
import { prisma } from '@/lib/prisma'
import { loadPassport } from '@/lib/passportRecords'

/**
 * RL-049: a shared passport. No session — the buyer it was sent to has no
 * account, and the point is that they can read it anyway. The token is
 * the only credential; a withdrawn or unknown one answers the same page,
 * so a guess learns nothing about which tokens ever existed.
 *
 * Never indexed and never sent as a referrer: the URL is the credential,
 * and a search result or a Referer header would hand it to strangers.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('passport')
  return {
    title: t('title'),
    description: t('metaDescription'),
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  }
}

export default async function SharedPassportPage({ params }: { params: { token: string } }) {
  const t = await getTranslations('passport')
  const link = await prisma.passportLink.findUnique({ where: { token: params.token }, include: { vehicle: true } })

  if (!link || link.revokedAt) {
    return (
      <div className="min-h-screen bg-surface-muted">
        <PublicHeader />
        <main className="mx-auto max-w-2xl px-4 py-10">
          <div className="card p-6 text-center">
            <h1 className="text-xl font-bold text-ink">{t('title')}</h1>
            <p className="mt-2 text-ink-muted">{t('unavailable')}</p>
          </div>
        </main>
      </div>
    )
  }

  const now = new Date()
  const view = await loadPassport(link.vehicle, link, now)
  return (
    <div className="min-h-screen bg-surface-muted">
      <PublicHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <PassportDocument view={view} projectType={link.vehicle.projectType} asOf={now} />
      </main>
    </div>
  )
}
