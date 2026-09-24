import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import ExportPdfButton from '@/components/ExportPdfButton'

// RL-033: job report — always free. A collaborator generates their own
// report; an owner picks which collaborator to report on. Never
// Pro-gated, unlike RL-014's full build history export.
export default async function JobReportPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { collaboratorId?: string; range?: string }
}) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const t = await getTranslations('jobReport')
  const tc = await getTranslations('common')
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  const range = searchParams.range === 'all' ? 'all' : '30d'
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

  if (isOwner) {
    const collaborators = await prisma.projectCollaborator.findMany({
      where: { vehicleId: vehicle.id, collaboratorUserId: { not: null } },
      orderBy: { invitedAt: 'desc' },
      include: { collaboratorUser: { select: { displayName: true } } },
    })
    // De-dupe: a removed-then-re-invited collaborator can have multiple rows.
    const byUserId = new Map<string, (typeof collaborators)[number]>()
    for (const c of collaborators) {
      if (c.collaboratorUserId && !byUserId.has(c.collaboratorUserId)) byUserId.set(c.collaboratorUserId, c)
    }
    const uniqueCollaborators = Array.from(byUserId.values())

    const selected = searchParams.collaboratorId
      ? uniqueCollaborators.find((c) => c.collaboratorUserId === searchParams.collaboratorId)
      : null

    return (
      <div className="mx-auto max-w-xl">
        <Link href={`/dashboard/vehicles/${vehicle.id}/collaborators`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
          {t('backToCollaborators')}
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-ink">{t('title')}</h1>

        {!selected ? (
          <div className="card p-5">
            <p className="mb-3 text-sm text-ink-muted">{t('pickCollaborator')}</p>
            {uniqueCollaborators.length === 0 ? (
              <p className="text-sm text-ink-faint">{t('noCollaborators')}</p>
            ) : (
              <div className="space-y-2">
                {uniqueCollaborators.map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/vehicles/${vehicle.id}/job-report?collaboratorId=${c.collaboratorUserId}`}
                    className="card block p-3 text-sm hover:bg-surface-muted"
                  >
                    {c.collaboratorUser?.displayName ?? c.label ?? c.email}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ReportPanel
            vehicleId={vehicle.id}
            vehicleName={vehicleName}
            collaboratorId={selected.collaboratorUserId!}
            collaboratorName={selected.collaboratorUser?.displayName ?? selected.label ?? selected.email}
            range={range}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('title')}</h1>
      <ReportPanel vehicleId={vehicle.id} vehicleName={vehicleName} collaboratorId={session.user.id} range={range} />
    </div>
  )
}

async function ReportPanel({
  vehicleId,
  vehicleName,
  collaboratorId,
  collaboratorName,
  range,
}: {
  vehicleId: string
  vehicleName: string
  collaboratorId: string
  collaboratorName?: string
  range: '30d' | 'all'
}) {
  const t = await getTranslations('jobReport')
  const baseHref = `/dashboard/vehicles/${vehicleId}/job-report?collaboratorId=${collaboratorId}`
  const endpoint = `/api/vehicles/${vehicleId}/export/job-report?collaboratorId=${collaboratorId}&range=${range}`

  return (
    <div className="card p-5">
      {collaboratorName && <p className="mb-3 text-sm text-ink-muted">{t('collaborator', { name: collaboratorName })}</p>}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={`${baseHref}&range=30d`} className={`chip ${range === '30d' ? 'chip-on' : ''}`} aria-current={range === '30d' ? 'true' : undefined}>
          {t('last30Days')}
        </Link>
        <Link href={`${baseHref}&range=all`} className={`chip ${range === 'all' ? 'chip-on' : ''}`} aria-current={range === 'all' ? 'true' : undefined}>
          {t('allTime')}
        </Link>
      </div>
      <ExportPdfButton endpoint={endpoint} fallbackName={`RigLog_JobReport_${vehicleName}`} />
    </div>
  )
}
