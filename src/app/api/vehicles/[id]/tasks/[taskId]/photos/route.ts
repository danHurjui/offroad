import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { isValidPhotoType } from '@/lib/projectType'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'

const FREE_TIER_PHOTOS_PER_TASK = 10

// RL-006: photo upload, linked to task.
export async function GET(_req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const photos = await prisma.taskPhoto.findMany({
    where: { taskId: params.taskId, vehicleId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(photos)
}

export async function POST(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const task = await prisma.task.findUnique({ where: { id: params.taskId } })
  if (!task || task.vehicleId !== vehicle.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const photoType = formData.get('photoType')
    const caption = formData.get('caption')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (typeof photoType !== 'string' || !isValidPhotoType(vehicle.projectType, photoType)) {
      return NextResponse.json({ error: 'Invalid photoType for this project type' }, { status: 400 })
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user?.isPro) {
      const existingCount = await prisma.taskPhoto.count({ where: { taskId: task.id } })
      if (existingCount >= FREE_TIER_PHOTOS_PER_TASK) {
        return NextResponse.json(
          { error: `Free tier is limited to ${FREE_TIER_PHOTOS_PER_TASK} photos per task. Upgrade to Pro for unlimited.`, code: 'UPGRADE_REQUIRED' },
          { status: 403 }
        )
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)

    const photo = await prisma.taskPhoto.create({
      data: {
        taskId: task.id,
        vehicleId: vehicle.id,
        url: storagePath,
        photoType,
        caption: typeof caption === 'string' ? caption : null,
      },
    })

    return NextResponse.json(photo, { status: 201 })
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
