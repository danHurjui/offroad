import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import TaskForm from '@/components/TaskForm'
import { taskFieldSuggestions } from '@/lib/taskSuggestions'

export default async function EditTaskPage({ params }: { params: { id: string; taskId: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const task = await prisma.task.findUnique({ where: { id: params.taskId } })
  if (!task || task.vehicleId !== vehicle.id) notFound()

  const isOwner = vehicle.ownerId === session.user.id
  if (!isOwner && task.addedByUserId !== session.user.id) notFound()

  const suggestions = await taskFieldSuggestions(vehicle.id)

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Edit task</h1>
      <Suspense fallback={null}>
        <TaskForm
          vehicleId={vehicle.id}
          projectType={vehicle.projectType}
          suggestions={suggestions}
          initialTask={{
            id: task.id,
            name: task.name,
            brand: task.brand,
            category: task.category,
            status: task.status,
            workType: task.workType,
            costRon: toNumberOrNull(task.costRon),
            partsCostRon: toNumberOrNull(task.partsCostRon),
            labourCostRon: toNumberOrNull(task.labourCostRon),
            date: task.date.toISOString(),
            notes: task.notes,
            supplierUrl: task.supplierUrl,
            workshopName: task.workshopName,
            workshopContact: task.workshopContact,
            originalityCondition: task.originalityCondition,
          }}
        />
      </Suspense>
    </div>
  )
}
