import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { saveUpload, deleteUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { readFormData } from '@/lib/requestBody'

async function loadTask(vehicleId: string, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.vehicleId !== vehicleId) return null
  return task
}

// RL-016: one receipt/document scan per task. Collaborators may attach a
// receipt to a task they added, same as editing it (see PATCH in
// tasks/[taskId]/route.ts) — owner can attach to any task.
export async function POST(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const task = await loadTask(params.id, params.taskId)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = vehicle.ownerId === session.user.id
  if (!isOwner && task.addedByUserId !== session.user.id) {
    return NextResponse.json({ error: 'You can only attach a receipt to tasks you added' }, { status: 403 })
  }

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const formData = parsedForm.form

  try {
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)

    const previousReceiptUrl = task.receiptUrl
    const updated = await prisma.task.update({ where: { id: task.id }, data: { receiptUrl: storagePath } })
    if (previousReceiptUrl) await deleteUpload(previousReceiptUrl)

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const task = await loadTask(params.id, params.taskId)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = vehicle.ownerId === session.user.id
  if (!isOwner && task.addedByUserId !== session.user.id) {
    return NextResponse.json({ error: 'You can only remove a receipt from tasks you added' }, { status: 403 })
  }
  if (!task.receiptUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const previousReceiptUrl = task.receiptUrl
    const updated = await prisma.task.update({ where: { id: task.id }, data: { receiptUrl: null } })
    await deleteUpload(previousReceiptUrl)
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
