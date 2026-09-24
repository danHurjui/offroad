import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { readFormData } from '@/lib/requestBody'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES } from '@/lib/storage'
import { ACCIDENT_PHOTO_LIMIT, ACCIDENT_PHOTO_TYPES } from '@/lib/accidents'
import { loadAccident } from '../../load'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * A photo of the damage or the repair. The key is stored, never a URL, and
 * it is filed under the vehicle **owner's** prefix whoever uploads it, so
 * the owner's erasure request finds it (collectStorageKeys()).
 *
 * Never shown on the public build page or the passport: the passport
 * counts them, and the owner shows them to a buyer if they choose to.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; accidentId: string } }): Promise<NextResponse> {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadAccident(params.id, params.accidentId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  const readOnly = await refuseIfReadOnly(loaded.vehicle)
  if (readOnly) return readOnly
  const { vehicle, accident } = loaded

  if (accident.photos.length >= ACCIDENT_PHOTO_LIMIT) {
    return await apiErrorWith('accidentPhotoLimit', { limit: ACCIDENT_PHOTO_LIMIT }, 400)
  }

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const file = parsedForm.form.get('file')
  if (!(file instanceof File)) return await apiError('fileRequired', 400)
  if (!ACCIDENT_PHOTO_TYPES.includes(file.type)) return await apiError('unsupportedFileType', 400)
  if (file.size > MAX_UPLOAD_BYTES) {
    return await apiErrorWith('fileTooLarge', { maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 }, 400)
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const key = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)
    const photo = await prisma.accidentPhoto.create({ data: { accidentId: accident.id, url: key } })
    return NextResponse.json(photo, { status: 201 })
  } catch (e) {
    if (e instanceof StorageError) return await apiError('saveFileFailed', 500)
    return await apiError('internalError', 500)
  }
}
