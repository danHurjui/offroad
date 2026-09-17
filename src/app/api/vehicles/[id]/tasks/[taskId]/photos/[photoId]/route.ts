import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
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
  if (!vehicle) return await apiError('notFound', 404)

  const photo = await prisma.taskPhoto.findUnique({ where: { id: params.photoId } })
  if (!photo || photo.taskId !== params.taskId || photo.vehicleId !== params.id) {
    return await apiError('notFound', 404)
  }

  // CLAUDE.md pitfall #4: collaborator access is read-mostly — a
  // collaborator may only delete photos on tasks they added themselves,
  // not any photo on the vehicle (matches the receipt DELETE route's
  // pattern for the same task-scoped resource).
  const task = await prisma.task.findUnique({ where: { id: photo.taskId } })
  const isOwner = vehicle.ownerId === session.user.id
  if (!isOwner && task?.addedByUserId !== session.user.id) {
    return await apiError('photoRemoveOwnOnly', 403)
  }

  try {
    await prisma.taskPhoto.delete({ where: { id: photo.id } })
    await deleteUpload(photo.url)
    return NextResponse.json({ message: 'Photo deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}
