import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { isValidTaskVocabulary, PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { serializeTask, serializeTaskFor } from '@/lib/serialize'
import { notifyFollowers } from '@/lib/followNotify'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'

async function loadTask(vehicleId: string, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { photos: true } })
  if (!task || task.vehicleId !== vehicleId) return null
  return task
}

// RL-005: task detail view.
export async function GET(_req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const task = await loadTask(params.id, params.taskId)
  if (!task) return await apiError('notFound', 404)

  // RL-031: redact costs for a collaborator when the owner hid them.
  const hideCosts = vehicle.ownerId !== session.user.id && vehicle.hideCostsFromCollaborators
  return NextResponse.json(serializeTaskFor(task, { hideCosts }))
}

// RL-004: edit. Collaborators may only edit tasks they added (CLAUDE.md
// "collaborator access is read-mostly").
export async function PATCH(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const task = await loadTask(params.id, params.taskId)
  if (!task) return await apiError('notFound', 404)

  const isOwner = vehicle.ownerId === session.user.id
  if (!isOwner && task.addedByUserId !== session.user.id) {
    return await apiError('editOwnTasksOnly', 403)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const badAmount = await invalidAmountResponse({
    costRon: body.costRon,
    partsCostRon: body.partsCostRon,
    labourCostRon: body.labourCostRon,
  })
  if (badAmount) return badAmount

  try {
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) data.name = String(body.name)
    if (body.brand !== undefined) data.brand = body.brand || null
    if (body.category !== undefined || body.status !== undefined) {
      const category = body.category ?? task.category
      const status = body.status ?? task.status
      if (!isValidTaskVocabulary(vehicle.projectType, category, status)) {
        return await apiError('invalidCategoryStatus', 400)
      }
      data.category = category
      data.status = status
    }
    if (body.date !== undefined) {
      if (Number.isNaN(new Date(body.date).getTime())) {
        return await apiError('invalidDate', 400)
      }
      data.date = new Date(body.date)
    }
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.supplierUrl !== undefined) data.supplierUrl = body.supplierUrl || null
    if (body.originalityCondition !== undefined) data.originalityCondition = body.originalityCondition || null

    if (body.workType !== undefined) {
      const resolvedWorkType = body.workType === 'WORKSHOP' ? 'WORKSHOP' : 'DIY'
      data.workType = resolvedWorkType
      if (resolvedWorkType === 'WORKSHOP') {
        if (!body.workshopName && !task.workshopName) {
          return await apiError('workshopNameRequired', 400)
        }
        data.workshopName = body.workshopName ?? task.workshopName
        data.workshopContact = body.workshopContact ?? task.workshopContact
        data.partsCostRon = body.partsCostRon != null ? Number(body.partsCostRon) : task.partsCostRon
        data.labourCostRon = body.labourCostRon != null ? Number(body.labourCostRon) : task.labourCostRon
        data.costRon = null
      } else {
        data.workshopName = null
        data.workshopContact = null
        data.partsCostRon = null
        data.labourCostRon = null
        data.costRon = body.costRon != null ? Number(body.costRon) : task.costRon
      }
    } else if (body.costRon !== undefined && task.workType === 'DIY') {
      data.costRon = body.costRon != null ? Number(body.costRon) : null
    } else if ((body.partsCostRon !== undefined || body.labourCostRon !== undefined) && task.workType === 'WORKSHOP') {
      if (body.partsCostRon !== undefined) data.partsCostRon = body.partsCostRon != null ? Number(body.partsCostRon) : null
      if (body.labourCostRon !== undefined) data.labourCostRon = body.labourCostRon != null ? Number(body.labourCostRon) : null
    }

    const updated = await prisma.task.update({ where: { id: task.id }, data, include: { photos: true } })

    // RL-023: notify followers only on the transition into "complete" —
    // not on every edit of an already-complete task.
    const completeStatus = PROJECT_TYPE_CONFIG[vehicle.projectType].completeStatus
    if (updated.status === completeStatus && task.status !== completeStatus) {
      await notifyFollowers(vehicle.id, { key: 'taskDone', values: { task: updated.name } })
    }

    return NextResponse.json(serializeTask(updated))
  } catch {
    return await apiError('internalError', 500)
  }
}

// Delete is owner-only (CLAUDE.md pitfall #4 / RL-031 DB-level rule).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if (vehicle.ownerId !== session.user.id) {
    return await apiError('onlyOwnerDeletesTask', 403)
  }

  const task = await loadTask(params.id, params.taskId)
  if (!task) return await apiError('notFound', 404)

  try {
    await prisma.task.delete({ where: { id: task.id } })
    return NextResponse.json({ message: 'Task deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}
