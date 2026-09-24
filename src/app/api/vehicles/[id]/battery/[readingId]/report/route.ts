import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readFormData } from '@/lib/requestBody'
import { saveUpload, deleteUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-056: a reading's report — the workshop's printout, or a photo of the
 * car's screen — one per reading. The key is stored, never a URL, filed
 * under the vehicle **owner's** prefix whoever uploads it, so the owner's
 * erasure request finds it (collectStorageKeys()).
 */
async function load(vehicleId: string, readingId: string, userId: string) {
  const vehicle = await requireVehicleAccess(vehicleId, userId)
  if (!vehicle) return { ok: false as const, error: await apiError('notFound', 404) }
  const reading = await prisma.batteryHealthReading.findUnique({ where: { id: readingId } })
  if (!reading || reading.vehicleId !== vehicle.id) return { ok: false as const, error: await apiError('notFound', 404) }
  if (vehicle.access !== 'owner' && reading.createdByUserId !== userId) {
    return { ok: false as const, error: await apiError('batteryOwnOnly', 403) }
  }
  return { ok: true as const, vehicle, reading }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; readingId: string } }): Promise<NextResponse> {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await load(params.id, params.readingId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  const readOnly = await refuseIfReadOnly(loaded.vehicle)
  if (readOnly) return readOnly
  const { vehicle, reading } = loaded

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const file = parsedForm.form.get('file')
  if (!(file instanceof File)) return await apiError('fileRequired', 400)
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return await apiError('unsupportedFileType', 400)
  if (file.size > MAX_UPLOAD_BYTES) {
    return await apiErrorWith('fileTooLarge', { maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 }, 400)
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const key = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)
    const updated = await prisma.batteryHealthReading.update({ where: { id: reading.id }, data: { reportUrl: key } })
    if (reading.reportUrl) await deleteUpload(reading.reportUrl)
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof StorageError) return await apiError('saveFileFailed', 500)
    return await apiError('internalError', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; readingId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await load(params.id, params.readingId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  const readOnly = await refuseIfReadOnly(loaded.vehicle)
  if (readOnly) return readOnly
  const { reading } = loaded
  if (!reading.reportUrl) return NextResponse.json({ ok: true })

  try {
    await prisma.batteryHealthReading.update({ where: { id: reading.id }, data: { reportUrl: null } })
    await deleteUpload(reading.reportUrl)
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
