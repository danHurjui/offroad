import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { saveUpload, deleteUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'
import { readFormData } from '@/lib/requestBody'

// RL-013: optional scan/photo attachment per document.
export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const document = await prisma.document.findUnique({ where: { id: params.docId } })
  if (!document || document.vehicleId !== vehicle.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const formData = parsedForm.form

  try {
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

    const previousFileUrl = document.fileUrl
    const updated = await prisma.document.update({ where: { id: document.id }, data: { fileUrl: storagePath } })
    if (previousFileUrl) await deleteUpload(previousFileUrl)

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
