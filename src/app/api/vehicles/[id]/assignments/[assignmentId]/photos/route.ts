import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readFormData } from '@/lib/requestBody'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES } from '@/lib/storage'
import { HANDOVER_PHOTO_LIMIT, HANDOVER_PHOTO_TYPES, isHandoverStage } from '@/lib/assignments'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-040 handover: a condition photo at the start or end of an assignment.
 * A manager of the vehicle or the assignment's own driver, and only while
 * it is active — they are taken at the handover, and a driver has no access
 * once it ends. Evidence, so there is no delete. Filed under the vehicle
 * owner's prefix whoever uploads (collectStorageKeys() finds it).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const assignment = await prisma.vehicleAssignment.findUnique({
    where: { id: params.assignmentId },
    include: { photos: { select: { stage: true } } },
  })
  if (!assignment || assignment.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && assignment.driverUserId !== session.user.id) return await apiError('notFound', 404)
  if (assignment.endedAt) return await apiError('assignmentAlreadyEnded', 400)

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const stage = parsedForm.form.get('stage')
  if (!isHandoverStage(stage)) return await apiError('handoverStageInvalid', 400)
  if (assignment.photos.filter((p) => p.stage === stage).length >= HANDOVER_PHOTO_LIMIT) {
    return await apiErrorWith('handoverPhotoLimit', { limit: HANDOVER_PHOTO_LIMIT }, 400)
  }
  const file = parsedForm.form.get('file')
  if (!(file instanceof File)) return await apiError('fileRequired', 400)
  if (!HANDOVER_PHOTO_TYPES.includes(file.type)) return await apiError('unsupportedFileType', 400)
  if (file.size > MAX_UPLOAD_BYTES) return await apiErrorWith('fileTooLarge', { maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 }, 400)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const key = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)
    const photo = await prisma.assignmentPhoto.create({ data: { assignmentId: assignment.id, stage, url: key } })
    return NextResponse.json(photo, { status: 201 })
  } catch (e) {
    if (e instanceof StorageError) return await apiError('saveFileFailed', 500)
    return await apiError('internalError', 500)
  }
}
