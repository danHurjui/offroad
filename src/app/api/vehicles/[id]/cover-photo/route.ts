import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { saveUpload, deleteUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { readFormData } from '@/lib/requestBody'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

// RL-002: cover photo upload, owner only.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

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
      return await apiErrorWith('fileTooLarge', { maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)

    const previousCover = vehicle.coverPhotoUrl
    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { coverPhotoUrl: storagePath },
    })
    // Pitfall #14: the row now points elsewhere, so without this the old
    // image stays in Blob for good. Harmless while the cover could only be
    // set once at creation; not once it can be replaced from the edit
    // screen. Same order as the document file route — swap the row first,
    // then drop what it no longer references.
    if (previousCover) await deleteUpload(previousCover)

    return NextResponse.json({ coverPhotoUrl: updated.coverPhotoUrl })
  } catch (e) {
    if (e instanceof StorageError) {
      return await apiError('savePhotoFailed', 500)
    }
    return await apiError('internalError', 500)
  }
}

// Clearing the cover, owner only. A PATCH with `coverPhotoUrl: null` would
// unset the column but leave the file behind, so removing it lives here
// where the bytes can go too.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  try {
    if (!vehicle.coverPhotoUrl) return NextResponse.json({ coverPhotoUrl: null })

    const previousCover = vehicle.coverPhotoUrl
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { coverPhotoUrl: null } })
    await deleteUpload(previousCover)

    return NextResponse.json({ coverPhotoUrl: null })
  } catch {
    return await apiError('internalError', 500)
  }
}
