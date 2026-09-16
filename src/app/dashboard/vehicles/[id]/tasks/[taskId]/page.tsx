import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { labelFor } from '@/lib/projectType'
import { getVocabulary, getOriginalityConditions } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import TaskPhotos from '@/components/TaskPhotos'
import TaskReceipt from '@/components/TaskReceipt'
import DeleteTaskButton from '@/components/DeleteTaskButton'

// RL-005: task detail view.
export default async function TaskDetailPage({ params }: { params: { id: string; taskId: string } }) {
  const originalityConditions = await getOriginalityConditions()
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { photos: { orderBy: { createdAt: 'asc' } }, addedBy: { select: { displayName: true } } },
  })
  if (!task || task.vehicleId !== vehicle.id) notFound()

  const isOwner = vehicle.ownerId === session.user.id
  const canEdit = isOwner || task.addedByUserId === session.user.id
  const config = await getVocabulary(vehicle.projectType)

  const addedByCollaborator = task.addedByUserId !== vehicle.ownerId
  // A deleted account leaves addedByUserId null. Looking a null up in
  // ProjectCollaborator would match any *pending* invite (those have no
  // collaboratorUserId yet), so the query is skipped entirely.
  const addedByDeletedAccount = task.addedByUserId === null
  let addedByRemoved = false
  if (addedByCollaborator && !addedByDeletedAccount) {
    const [activeRow, removedRow] = await Promise.all([
      prisma.projectCollaborator.findFirst({
        where: { vehicleId: vehicle.id, collaboratorUserId: task.addedByUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
      prisma.projectCollaborator.findFirst({
        where: { vehicleId: vehicle.id, collaboratorUserId: task.addedByUserId, status: 'REMOVED' },
        select: { id: true },
      }),
    ])
    addedByRemoved = !activeRow && Boolean(removedRow)
  }

  const partsCostRon = toNumberOrNull(task.partsCostRon)
  const labourCostRon = toNumberOrNull(task.labourCostRon)
  const costRon = toNumberOrNull(task.costRon)
  const totalCost = task.workType === 'WORKSHOP' ? (partsCostRon ?? 0) + (labourCostRon ?? 0) : costRon ?? 0

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to {config.screenTitle}
      </Link>

      <div className="card p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              {task.workType === 'WORKSHOP' && <span title="Workshop task">🔧</span>}
              <span className="badge bg-surface-subtle text-ink-muted">{labelFor(config.categories, task.category)}</span>
              <span className="badge badge-brand">{labelFor(config.statusTags, task.status)}</span>
            </div>
            <h1 className="text-xl font-bold text-ink">{task.name}</h1>
            {task.brand && <p className="text-sm text-ink-muted">{task.brand}</p>}
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-2">
              <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/${task.id}/edit`} className="btn-secondary">
                Edit
              </Link>
              {isOwner && <DeleteTaskButton vehicleId={vehicle.id} taskId={task.id} />}
            </div>
          )}
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink-faint">Date</dt>
            <dd className="text-ink">{new Date(task.date).toLocaleDateString('ro-RO')}</dd>
          </div>
          {addedByCollaborator && (
            <div>
              <dt className="text-ink-faint">Added by</dt>
              <dd className="text-ink">
                {addedByDeletedAccount ? (
                  <span className="text-ink-faint">A deleted account</span>
                ) : (
                  <>
                    {task.addedBy?.displayName}
                    {addedByRemoved && <span className="ml-1 text-xs text-ink-faint">(access removed)</span>}
                  </>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-faint">Total cost</dt>
            <dd className="font-semibold text-ink">{totalCost.toLocaleString('ro-RO')} RON</dd>
          </div>
          {task.workType === 'WORKSHOP' && (
            <>
              <div>
                <dt className="text-ink-faint">Workshop</dt>
                <dd className="text-ink">{task.workshopName}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Parts / Labour</dt>
                <dd className="text-ink">{(partsCostRon ?? 0).toLocaleString('ro-RO')} / {(labourCostRon ?? 0).toLocaleString('ro-RO')} RON</dd>
              </div>
            </>
          )}
          {task.supplierUrl && (
            <div className="col-span-2">
              <dt className="text-ink-faint">Supplier</dt>
              <dd>
                <a href={task.supplierUrl} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-300 hover:underline">
                  {task.supplierUrl}
                </a>
              </dd>
            </div>
          )}
          {task.originalityCondition && (
            <div className="col-span-2">
              <dt className="text-ink-faint">Part condition</dt>
              <dd className="text-ink">{labelFor(originalityConditions, task.originalityCondition)}</dd>
            </div>
          )}
          {task.notes && (
            <div className="col-span-2">
              <dt className="text-ink-faint">Notes</dt>
              <dd className="whitespace-pre-wrap text-ink">{task.notes}</dd>
            </div>
          )}
        </dl>

        <hr className="mb-4 border-surface-border" />
        <h2 className="mb-3 font-semibold text-ink">Receipt</h2>
        <TaskReceipt vehicleId={vehicle.id} taskId={task.id} receiptUrl={task.receiptUrl} canEdit={canEdit} />

        <hr className="my-4 border-surface-border" />
        <h2 className="mb-3 font-semibold text-ink">Photos</h2>
        <TaskPhotos
          vehicleId={vehicle.id}
          taskId={task.id}
          projectType={vehicle.projectType}
          photos={task.photos}
        />
      </div>
    </div>
  )
}
