import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'

const MAX_FOUND_STATE_PHOTOS = 20 // RL-008

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (vehicle.projectType !== 'RESTORATION') {
    return NextResponse.json({ error: 'Found state only applies to restoration projects' }, { status: 400 })
  }

  const foundState = await prisma.foundState.findUnique({ where: { vehicleId: vehicle.id } })
  if (!foundState) {
    return NextResponse.json({ error: 'Complete the found state intake before adding photos' }, { status: 400 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const caption = formData.get('caption')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` }, { status: 400 })
    }

    const existingCount = await prisma.foundStatePhoto.count({ where: { foundStateId: foundState.id } })
    if (existingCount >= MAX_FOUND_STATE_PHOTOS) {
      return NextResponse.json({ error: `Found state is limited to ${MAX_FOUND_STATE_PHOTOS} photos` }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)

    const photo = await prisma.foundStatePhoto.create({
      data: {
        foundStateId: foundState.id,
        url: storagePath,
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
