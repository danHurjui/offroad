import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import PartsRequestForm from '@/components/PartsRequestForm'
import { hasPro, PRO_SELECT } from '@/lib/pro'

export default async function NewPartsRequestPage() {
  const session = await requireSessionOrRedirect()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { ...PRO_SELECT } })

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href="/community/parts-wanted" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to parts wanted
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">Post a parts request</h1>

      {hasPro(user) ? (
        <PartsRequestForm />
      ) : (
        <div className="card p-5">
          <p className="text-sm text-ink-muted">
            Posting a parts request is a Pro feature. Upgrading to Pro is not available in this preview build.
          </p>
        </div>
      )}
    </div>
  )
}
