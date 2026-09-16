import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import TaskForm from '@/components/TaskForm'
import { taskFieldSuggestions } from '@/lib/taskSuggestions'

export default async function NewTaskPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = await getVocabulary(vehicle.projectType)
  const suggestions = await taskFieldSuggestions(vehicle.id)
  const isOwner = vehicle.ownerId === session.user.id
  const collaborator = isOwner
    ? null
    : await prisma.projectCollaborator.findFirst({
        where: { vehicleId: vehicle.id, collaboratorUserId: session.user.id, status: 'ACTIVE' },
        select: { label: true },
      })

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{config.addTaskCta}</h1>
      <Suspense fallback={null}>
        <TaskForm
          vehicleId={vehicle.id}
          projectType={vehicle.projectType}
          collaboratorLabel={isOwner ? undefined : collaborator?.label ?? ''}
          suggestions={suggestions}
        />
      </Suspense>
    </div>
  )
}
