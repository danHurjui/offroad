import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { deleteUpload } from '@/lib/storage'

// RL-006: delete removes from Storage and from the task.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; taskId: string; photoId: string } }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const photo = await prisma.taskPhoto.findUnique({ where: { id: params.photoId } })
  if (!photo || photo.taskId !== params.taskId || photo.vehicleId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await prisma.taskPhoto.delete({ where: { id: photo.id } })
    await deleteUpload(photo.url)
    return NextResponse.json({ message: 'Photo deleted' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
