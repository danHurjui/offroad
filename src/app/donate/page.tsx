import type { Metadata } from 'next'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatRon, supporterName } from '@/lib/donations'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import DonateForm from '@/components/DonateForm'

export const metadata: Metadata = {
  title: 'Support RigLog',
  description: 'RigLog is small and self-funded. A one-off contribution helps cover hosting and keeps the free tier free.',
}

// Supporters and totals must reflect settled payments only, and the
// webhook is what marks a donation PAID — so everything here reads live.
export const dynamic = 'force-dynamic'

export default async function DonatePage({
  searchParams,
}: {
  searchParams: { canceled?: string }
}) {
  const session = await getServerSession(authOptions)

  const [supporters, totals] = await Promise.all([
    prisma.donation.findMany({
      where: { status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      take: 20,
      select: {
        id: true,
        amountBani: true,
        message: true,
        isAnonymous: true,
        paidAt: true,
        user: { select: { displayName: true } },
      },
    }),
    prisma.donation.aggregate({
      where: { status: 'PAID' },
      _sum: { amountBani: true },
      _count: true,
    }),
  ])

  const totalBani = totals._sum.amountBani ?? 0

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">Support RigLog</h1>
          <p className="mx-auto mt-3 max-w-2xl text-ink-muted">
            RigLog is built and paid for by one person. Hosting, the database and the domain cost money
            every month, and the free tier exists because a few people chip in. If the app has been
            useful, this helps keep it that way.
          </p>
        </div>

        {searchParams.canceled && (
          <div className="card mx-auto mb-6 max-w-xl note-warn p-4 text-sm text-ink">
            Checkout was cancelled — nothing was charged. No hard feelings.
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <DonateForm signedIn={Boolean(session)} />
            {!session && (
              <p className="mt-4 text-center text-sm text-ink-muted">
                You don&apos;t need an account to donate.{' '}
                <Link href="/login" className="text-brand-600 dark:text-brand-300 hover:underline">
                  Log in
                </Link>{' '}
                first if you&apos;d like it credited to your name.
              </p>
            )}
          </div>

          <div>
            <div className="card mb-5 p-5">
              <h2 className="font-semibold text-ink">Where it goes</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                <li>Hosting and the Postgres database</li>
                <li>Domain, email delivery and push notifications</li>
                <li>Keeping one vehicle free for everyone, forever</li>
              </ul>
              <p className="mt-4 text-xs text-ink-faint">
                A donation is a contribution, not a purchase — it doesn&apos;t unlock Pro. If you want the
                Pro features, the{' '}
                <Link href="/dashboard/upgrade" className="text-brand-600 dark:text-brand-300 hover:underline">
                  upgrade page
                </Link>{' '}
                is the place for that.
              </p>
            </div>

            <div className="card p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-semibold text-ink">Supporters</h2>
                {totals._count > 0 && (
                  <span className="text-sm text-ink-muted">
                    {totals._count} {totals._count === 1 ? 'person' : 'people'} · {formatRon(totalBani)}
                  </span>
                )}
              </div>

              {supporters.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No donations yet — you could be the first.
                </p>
              ) : (
                <ul className="divide-y divide-surface-border">
                  {supporters.map((d) => (
                    <li key={d.id} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-ink">{supporterName(d)}</span>
                        <span className="shrink-0 text-sm text-ink-muted">{formatRon(d.amountBani)}</span>
                      </div>
                      {d.message && <p className="mt-1 text-sm text-ink-muted">{d.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
