import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { translator } from '@/i18n/translator'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { isValidTaskVocabulary } from '@/lib/projectType'
import { serializeTask, serializeTaskFor } from '@/lib/serialize'
import { sendEmail, collaboratorTaskAddedEmail, emailLocale } from '@/lib/email'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'
import { appUrlForNotification } from '@/lib/appUrl'
import { parseKm } from '@/lib/odometer'
import { ReadingConflict, conflictResponse, futureResponse, isFutureDay, syncTaskReading } from '@/lib/odometerRecords'

// RL-004: add / edit a task or modification. RL-029: DIY/workshop split.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status')

    const tasks = await prisma.task.findMany({
      where: {
        vehicleId: vehicle.id,
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: { photos: true },
    })

    // RL-031: redact costs for a collaborator when the owner hid them.
    const hideCosts = vehicle.access !== 'owner' && vehicle.hideCostsFromCollaborators
    return NextResponse.json(tasks.map((t) => serializeTaskFor(t, { hideCosts })))
  } catch {
    return await apiError('internalError', 500)
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const {
      name,
      brand,
      category,
      status,
      workType,
      costRon,
      partsCostRon,
      labourCostRon,
      date,
      notes,
      supplierUrl,
      workshopName,
      workshopContact,
      workshopId,
      originalityCondition,
    } = body

    if (!name || typeof name !== 'string') {
      return await apiError('nameRequired', 400)
    }
    if (!isValidTaskVocabulary(vehicle.projectType, category, status)) {
      return await apiError('invalidCategoryStatus', 400)
    }
    const badAmount = await invalidAmountResponse({ costRon, partsCostRon, labourCostRon })
    if (badAmount) return badAmount
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return await apiError('dateRequired', 400)
    }
    const resolvedWorkType: 'WORKSHOP' | 'DIY' = workType === 'WORKSHOP' ? 'WORKSHOP' : 'DIY'
    if (resolvedWorkType === 'WORKSHOP' && !workshopName) {
      return await apiError('workshopNameRequired', 400)
    }

    // RL-044: the km the job was done at, recorded as a side-effect of
    // logging the job — the common case, and the one that makes the
    // odometer history fill in without being a chore of its own.
    const km = parseKm(body.odometerKm)
    if (!km.ok) return await apiError('odometerKmInvalid', 400)
    if (km.km !== null && isFutureDay(new Date(date))) return await futureResponse()

    const taskData = {
      vehicleId: vehicle.id,
      addedByUserId: session.user.id,
      name,
      brand: brand || null,
      category,
      status,
      workType: resolvedWorkType,
      costRon: resolvedWorkType === 'DIY' && costRon != null ? Number(costRon) : null,
      partsCostRon: resolvedWorkType === 'WORKSHOP' && partsCostRon != null ? Number(partsCostRon) : null,
      labourCostRon: resolvedWorkType === 'WORKSHOP' && labourCostRon != null ? Number(labourCostRon) : null,
      date: new Date(date),
      notes: notes || null,
      supplierUrl: supplierUrl || null,
      workshopName: resolvedWorkType === 'WORKSHOP' ? workshopName : null,
      workshopContact: resolvedWorkType === 'WORKSHOP' ? workshopContact || null : null,
      workshopId: workshopId || null,
      originalityCondition: originalityCondition || null,
    }

    let task
    if (km.km === null) {
      task = await prisma.task.create({ data: taskData })
    } else {
      // One transaction: a refused reading rolls the task back with it, so
      // the job is never saved with half of what was typed.
      const kmValue = km.km
      try {
        task = await prisma.$transaction(async (tx) => {
          const created = await tx.task.create({ data: taskData })
          const check = await syncTaskReading(tx, {
            vehicleId: vehicle.id,
            taskId: created.id,
            km: kmValue,
            date: created.date,
            userId: session.user.id,
          })
          if (!check.ok) throw new ReadingConflict(check, kmValue)
          return created
        })
      } catch (e) {
        if (e instanceof ReadingConflict) return await conflictResponse(e.check, e.km)
        throw e
      }
    }

    // touch the vehicle so dashboard "most recently updated" sort reflects it
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { updatedAt: new Date() } })

    // RL-032: notify the owner when a collaborator (not the owner) logs a task.
    // Not for a company vehicle: its ownerId is only the account of record,
    // who may have left the organisation since.
    if (vehicle.access !== 'owner' && !vehicle.organizationId) {
      const [owner, collaboratorUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { email: true, locale: true } }),
        prisma.user.findUnique({ where: { id: session.user.id }, select: { displayName: true } }),
      ])
      const baseUrl = appUrlForNotification('the follower notification for a new task')
      if (owner && baseUrl) {
        // The owner is the one reading this, so it renders in their
        // language — not the collaborator's, who triggered it.
        const locale = emailLocale(owner)
        const tEmail = await translator(locale, 'email')
        const collaboratorName = collaboratorUser?.displayName ?? tEmail('taskAdded.aCollaborator')

        const { subject, html } = await collaboratorTaskAddedEmail(locale, {
          collaboratorName,
          taskName: name,
          vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          vehicleUrl: `${baseUrl}/dashboard/vehicles/${vehicle.id}/tasks/${task.id}`,
        })
        await sendEmail({ to: owner.email, subject, html })
      }
    }

    return NextResponse.json(serializeTask(task), { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
