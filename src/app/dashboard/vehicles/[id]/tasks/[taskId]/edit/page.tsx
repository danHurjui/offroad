import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import TaskForm from '@/components/TaskForm'
import { taskFieldSuggestions } from '@/lib/taskSuggestions'

export default async function EditTaskPage({ params }: { params: { id: string; taskId: string } }) {
  const t = await getTranslations('task')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { odometerReading: { select: { km: true } } },
  })
  if (!task || task.vehicleId !== vehicle.id) notFound()

  const isOwner = vehicle.access === 'owner'
  const costsHidden = hidesCosts(vehicle)
  if (!isOwner && task.addedByUserId !== session.user.id) notFound()

  const suggestions = await taskFieldSuggestions(vehicle.id)

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/${task.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: task.name })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('editTitle')}</h1>
      <Suspense fallback={null}>
        <TaskForm
          vehicleId={vehicle.id}
          projectType={vehicle.projectType}
          suggestions={suggestions}
          costsHidden={costsHidden}
          initialTask={{
            id: task.id,
            name: task.name,
            brand: task.brand,
            category: task.category,
            status: task.status,
            workType: task.workType,
            // Whoever may not see costs gets blank fields; an untouched
            // blank is not sent, so the stored amounts are left alone.
            costRon: costsHidden ? null : toNumberOrNull(task.costRon),
            partsCostRon: costsHidden ? null : toNumberOrNull(task.partsCostRon),
            labourCostRon: costsHidden ? null : toNumberOrNull(task.labourCostRon),
            date: task.date.toISOString(),
            notes: task.notes,
            supplierUrl: task.supplierUrl,
            workshopName: task.workshopName,
            workshopContact: task.workshopContact,
            originalityCondition: task.originalityCondition,
            odometerKm: task.odometerReading?.km ?? null,
          }}
        />
      </Suspense>
    </div>
  )
}
