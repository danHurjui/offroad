import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PublicHeader from '@/components/PublicHeader'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { labelFor } from '@/lib/projectType'
import { getPartConditions } from '@/lib/vocabulary'
import PartsRequestComments from '@/components/PartsRequestComments'
import MarkFoundButton from '@/components/MarkFoundButton'

async function findRequest(id: string) {
  return prisma.partsRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, location: true } },
      comments: { orderBy: { createdAt: 'asc' }, include: { user: { select: { displayName: true } } } },
    },
  })
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const request = await findRequest(params.id)
  if (!request) return {}
  return {
    title: `${request.partName} wanted — ${request.vehicleMake} ${request.vehicleModel} | RigLog`,
    description: `${request.user.displayName} is looking for a ${request.partName} on RigLog.`,
  }
}

export default async function PartsRequestDetailPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('parts')
  const partConditions = await getPartConditions()
  const request = await findRequest(params.id)
  if (!request) notFound()

  const session = await getServerSession(authOptions)
  const isOwner = session?.user.id === request.user.id

  return (
    <div className="min-h-screen bg-surface-muted">
      <PublicHeader />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/community/parts-wanted" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
          {t('backToParts')}
        </Link>

        <div className="card p-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <span className={`badge ${request.status === 'OPEN' ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}>
                {request.status === 'OPEN' ? t('wanted') : t('found')}
              </span>
              <h1 className="mt-2 text-xl font-bold text-ink">
                {request.partName} — {request.vehicleMake} {request.vehicleModel}
              </h1>
            </div>
            {isOwner && request.status === 'OPEN' && <MarkFoundButton partsRequestId={request.id} />}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {request.partNumber && (
              <div>
                <dt className="text-ink-faint">{t('partNumber')}</dt>
                <dd className="text-ink">{request.partNumber}</dd>
              </div>
            )}
            <div>
              <dt className="text-ink-faint">{t('conditionAccepted')}</dt>
              <dd className="text-ink">{labelFor(partConditions, request.conditionAccepted)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-ink-faint">{t('locationShipping')}</dt>
              <dd className="text-ink">{request.location}</dd>
            </div>
            {request.description && (
              <div className="col-span-2">
                <dt className="text-ink-faint">{t('descriptionLabel')}</dt>
                <dd className="whitespace-pre-wrap text-ink">{request.description}</dd>
              </div>
            )}
          </dl>

          <p className="mt-4 text-xs text-ink-faint">
            {t('postedBy', { name: request.user.displayName })}
            {request.user.location ? ` · ${request.user.location}` : ''} · {request.createdAt.toLocaleDateString('ro-RO')}
          </p>
        </div>

        <div className="card mt-6 p-6">
          <PartsRequestComments
            partsRequestId={request.id}
            comments={request.comments.map((c) => ({
              id: c.id,
              body: c.body,
              createdAt: c.createdAt.toISOString(),
              user: c.user,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
