import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readFormData } from '@/lib/requestBody'
import { saveUpload, deleteUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { serializeFuelEntry } from '@/lib/serialize'

/**
 * A fill-up's receipt: a photo or PDF, one per entry, the same rules as a
 * task receipt (RL-016). The key is stored, never a URL, and it is filed
 * under the vehicle **owner's** prefix whoever uploads it, so the owner's
 * erasure request finds it (collectStorageKeys()).
 *
 * No OCR — reading the receipt waits on an OCR provider being chosen
 * (RL-048); until then the photo is kept as the proof, and the three
 * numbers are typed.
 */
async function load(vehicleId: string, entryId: string, userId: string) {
  const vehicle = await requireVehicleAccess(vehicleId, userId)
  if (!vehicle) return { ok: false as const, error: await apiError('notFound', 404) }
  const entry = await prisma.fuelEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.vehicleId !== vehicle.id) return { ok: false as const, error: await apiError('notFound', 404) }
  if (vehicle.ownerId !== userId && entry.createdByUserId !== userId) {
    return { ok: false as const, error: await apiError('fuelOwnOnly', 403) }
  }
  return { ok: true as const, vehicle, entry }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; entryId: string } }): Promise<NextResponse> {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await load(params.id, params.entryId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  const { vehicle, entry } = loaded

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
    const updated = await prisma.fuelEntry.update({
      where: { id: entry.id },
      data: { receiptUrl: key },
      include: { odometerReading: { select: { km: true } } },
    })
    if (entry.receiptUrl) await deleteUpload(entry.receiptUrl)
    return NextResponse.json(serializeFuelEntry(updated))
  } catch (e) {
    if (e instanceof StorageError) return await apiError('saveFileFailed', 500)
    return await apiError('internalError', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await load(params.id, params.entryId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  const { entry } = loaded
  if (!entry.receiptUrl) return NextResponse.json({ ok: true })

  try {
    await prisma.fuelEntry.update({ where: { id: entry.id }, data: { receiptUrl: null } })
    await deleteUpload(entry.receiptUrl)
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
