import Link from 'next/link'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { labelFor, PART_CONDITIONS } from '@/lib/projectType'

export const metadata: Metadata = {
  title: 'Parts wanted — RigLog Community',
  description: 'Hard-to-find restoration parts the RigLog community is looking for.',
}

// RL-024: "Parts wanted" section of the community feed — every OPEN
// request, most recent first. Posting is Pro-gated; browsing isn't.
export default async function PartsWantedPage() {
  const session = await getServerSession(authOptions)

  const requests = await prisma.partsRequest.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { displayName: true, location: true } }, _count: { select: { comments: true } } },
    take: 100,
  })

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/community" className="mb-1 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
              ← Back to community
            </Link>
            <h1 className="text-2xl font-bold text-ink">Parts wanted</h1>
          </div>
          {session ? (
            <Link href="/community/parts-wanted/new" className="btn-primary">
              Post a request
            </Link>
          ) : (
            <Link href="/login" className="btn-secondary">
              Log in to post
            </Link>
          )}
        </div>

        {requests.length === 0 ? (
          <p className="text-center text-sm text-ink-faint">No open parts requests right now.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <Link key={r.id} href={`/community/parts-wanted/${r.id}`} className="card block p-4 hover:shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-ink">
                    {r.partName} — {r.vehicleMake} {r.vehicleModel}
                  </h2>
                  <span className="badge bg-surface-subtle text-ink-muted">
                    {r._count.comments} {r._count.comments === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {labelFor(PART_CONDITIONS, r.conditionAccepted)} · {r.location}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  {r.user.displayName}
                  {r.user.location ? ` · ${r.user.location}` : ''} · {r.createdAt.toLocaleDateString('ro-RO')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
