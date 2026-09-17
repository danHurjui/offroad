import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { deleteUpload } from '@/lib/storage'
import { readJsonBody } from '@/lib/requestBody'
import { clearedReminderFields } from '@/lib/documents'

async function loadDocument(vehicleId: string, docId: string) {
  const document = await prisma.document.findUnique({ where: { id: docId } })
  if (!document || document.vehicleId !== vehicleId) return null
  return document
}

export async function GET(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const document = await loadDocument(params.id, params.docId)
  if (!document) return await apiError('notFound', 404)

  return NextResponse.json(document)
}

// RL-013: "dismiss a reminder once renewed — prompts to update the expiry
// date." Renewing is just PATCHing expiryDate; changing it re-arms all
// three reminder milestones by clearing the reminderNSentAt fields, so a
// document that already fired its 30-day email doesn't stay silently
// "done" after the user pushes the date out again.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const document = await loadDocument(params.id, params.docId)
  if (!document) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const data: Record<string, unknown> = {}

    if (body.expiryDate !== undefined) {
      if (Number.isNaN(new Date(body.expiryDate).getTime())) {
        return await apiError('invalidExpiryDate', 400)
      }
      data.expiryDate = new Date(body.expiryDate)
      // Renewing re-arms every threshold. Derived, so a milestone added to
      // documents.ts cannot leave one stuck as already-sent.
      Object.assign(data, clearedReminderFields())
    }

    const updated = await prisma.document.update({ where: { id: document.id }, data })
    return NextResponse.json(updated)
  } catch {
    return await apiError('internalError', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const document = await loadDocument(params.id, params.docId)
  if (!document) return await apiError('notFound', 404)

  try {
    await prisma.document.delete({ where: { id: document.id } })
    if (document.fileUrl) await deleteUpload(document.fileUrl)
    return NextResponse.json({ message: 'Document deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}
