import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { readFormData } from '@/lib/requestBody'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

const MAX_FOUND_STATE_PHOTOS = 20 // RL-008

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly
  if (vehicle.projectType !== 'RESTORATION') {
    return await apiError('foundStateRestorationOnly', 400)
  }

  const foundState = await prisma.foundState.findUnique({ where: { vehicleId: vehicle.id } })
  if (!foundState) {
    return await apiError('foundStateIntakeFirst', 400)
  }

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const formData = parsedForm.form

  try {
    const file = formData.get('file')
    const caption = formData.get('caption')

    if (!(file instanceof File)) {
      return await apiError('fileRequired', 400)
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      return await apiError('unsupportedFileType', 400)
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return await apiErrorWith('fileTooLarge', { maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 }, 400)
    }

    const existingCount = await prisma.foundStatePhoto.count({ where: { foundStateId: foundState.id } })
    if (existingCount >= MAX_FOUND_STATE_PHOTOS) {
      return await apiErrorWith('foundStatePhotoLimit', { limit: MAX_FOUND_STATE_PHOTOS }, 400)
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
      return await apiError('savePhotoFailed', 500)
    }
    return await apiError('internalError', 500)
  }
}
