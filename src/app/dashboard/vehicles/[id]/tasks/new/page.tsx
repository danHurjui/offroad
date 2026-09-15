import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import TaskForm from '@/components/TaskForm'

export default async function NewTaskPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{config.addTaskCta}</h1>
      <Suspense fallback={null}>
        <TaskForm vehicleId={vehicle.id} projectType={vehicle.projectType} />
      </Suspense>
    </div>
  )
}
