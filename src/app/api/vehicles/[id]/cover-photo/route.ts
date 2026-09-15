import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'

// RL-002: cover photo upload, owner only.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const formData = await req.formData()
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

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { coverPhotoUrl: storagePath },
    })

    return NextResponse.json({ coverPhotoUrl: updated.coverPhotoUrl })
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
