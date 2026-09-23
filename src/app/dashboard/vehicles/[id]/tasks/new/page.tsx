import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import TaskForm from '@/components/TaskForm'
import { taskFieldSuggestions } from '@/lib/taskSuggestions'
import { hasPro, PRO_SELECT } from '@/lib/pro'

export default async function NewTaskPage({ params }: { params: { id: string } }) {
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = await getVocabulary(vehicle.projectType)
  const suggestions = await taskFieldSuggestions(vehicle.id)
  // RL-048: scanning an invoice is Pro — the account of record's plan, as
  // on the fuel form.
  const planOwner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  const isOwner = vehicle.access === 'owner'
  const collaborator = isOwner
    ? null
    : await prisma.projectCollaborator.findFirst({
        where: { vehicleId: vehicle.id, collaboratorUserId: session.user.id, status: 'ACTIVE' },
        select: { label: true },
      })

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{config.addTaskCta}</h1>
      <Suspense fallback={null}>
        <TaskForm
          vehicleId={vehicle.id}
          projectType={vehicle.projectType}
          collaboratorLabel={isOwner ? undefined : collaborator?.label ?? ''}
          suggestions={suggestions}
          costsHidden={hidesCosts(vehicle)}
          canScan={hasPro(planOwner)}
          offerScanUpgrade={isOwner && !vehicle.organizationId}
        />
      </Suspense>
    </div>
  )
}
