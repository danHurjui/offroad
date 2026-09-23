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
import { parseKm } from '@/lib/odometer'
import { ReadingConflict, conflictResponse, futureResponse, isFutureDay, syncTaskReading } from '@/lib/odometerRecords'
import { deleteStoredFiles } from '@/lib/personalData'

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
  const hideCosts = vehicle.access !== 'owner' && vehicle.hideCostsFromCollaborators
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

  const isOwner = vehicle.access === 'owner'
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

    // RL-044: the job's odometer reading follows the job. Sending
    // `odometerKm` sets or clears it; moving the job's date moves the
    // reading too, re-checked against the rest of the history.
    const kmSent = body.odometerKm !== undefined
    const km = parseKm(body.odometerKm)
    if (kmSent && !km.ok) return await apiError('odometerKmInvalid', 400)
    const dateChanged = data.date !== undefined

    let updated
    if (!kmSent && !dateChanged) {
      updated = await prisma.task.update({ where: { id: task.id }, data, include: { photos: true } })
    } else {
      try {
        updated = await prisma.$transaction(async (tx) => {
          const saved = await tx.task.update({ where: { id: task.id }, data, include: { photos: true } })
          const linked = await tx.odometerReading.findUnique({ where: { taskId: task.id }, select: { km: true } })
          const kmValue = kmSent && km.ok ? km.km : linked?.km ?? null
          if (kmValue === null && !linked) return saved
          if (kmValue !== null && isFutureDay(saved.date)) throw new FutureReading()
          const check = await syncTaskReading(tx, {
            vehicleId: vehicle.id,
            taskId: task.id,
            km: kmValue,
            date: saved.date,
            userId: session.user.id,
          })
          if (!check.ok) throw new ReadingConflict(check, kmValue as number)
          return saved
        })
      } catch (e) {
        if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
        if (e instanceof FutureReading) return await futureResponse()
        throw e
      }
    }

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
  if (vehicle.access !== 'owner') {
    return await apiError('onlyOwnerDeletesTask', 403)
  }

  const task = await loadTask(params.id, params.taskId)
  if (!task) return await apiError('notFound', 404)

  try {
    // Pitfall #14: the photo and receipt files are gathered before the
    // rows cascade away, or nothing is left to find them by. This handler
    // used to skip that, so every deleted job orphaned its files.
    const keys = [task.receiptUrl, ...task.photos.map((p) => p.url)].filter((k): k is string => Boolean(k))
    // RL-044: the km typed with the job goes with it — a job deleted as a
    // mistake usually had the wrong km too. The relation is SetNull only
    // as the database's safety net.
    await prisma.odometerReading.deleteMany({ where: { taskId: task.id, source: 'TASK' } })
    await prisma.task.delete({ where: { id: task.id } })
    await deleteStoredFiles(keys)
    return NextResponse.json({ message: 'Task deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}

/** Rolls the PATCH transaction back when a job with a reading is moved into the future. */
class FutureReading extends Error {}

