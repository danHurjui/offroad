import { NextRequest, NextResponse } from 'next/server'
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

// RL-004: add / edit a task or modification. RL-029: DIY/workshop split.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    const hideCosts = vehicle.ownerId !== session.user.id && vehicle.hideCostsFromCollaborators
    return NextResponse.json(tasks.map((t) => serializeTaskFor(t, { hideCosts })))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!isValidTaskVocabulary(vehicle.projectType, category, status)) {
      return NextResponse.json({ error: 'Invalid category/status for this project type' }, { status: 400 })
    }
    const badAmount = invalidAmountResponse({ costRon, partsCostRon, labourCostRon })
    if (badAmount) return badAmount
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }
    const resolvedWorkType = workType === 'WORKSHOP' ? 'WORKSHOP' : 'DIY'
    if (resolvedWorkType === 'WORKSHOP' && !workshopName) {
      return NextResponse.json({ error: 'workshopName is required when work type is Workshop' }, { status: 400 })
    }

    const task = await prisma.task.create({
      data: {
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
      },
    })

    // touch the vehicle so dashboard "most recently updated" sort reflects it
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { updatedAt: new Date() } })

    // RL-032: notify the owner when a collaborator (not the owner) logs a task.
    if (session.user.id !== vehicle.ownerId) {
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
