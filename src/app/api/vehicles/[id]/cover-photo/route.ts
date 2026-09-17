import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { readFormData } from '@/lib/requestBody'

// RL-002: cover photo upload, owner only.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const formData = parsedForm.form

  try {
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return await apiError('fileRequired', 400)
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      return await apiError('unsupportedFileType', 400)
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
      return await apiError('savePhotoFailed', 500)
    }
    return await apiError('internalError', 500)
  }
}
