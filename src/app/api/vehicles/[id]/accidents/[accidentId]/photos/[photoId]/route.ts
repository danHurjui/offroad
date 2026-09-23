import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { loadAccident } from '../../../load'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; accidentId: string; photoId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadAccident(params.id, params.accidentId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  const photo = loaded.accident.photos.find((p) => p.id === params.photoId)
  if (!photo) return await apiError('notFound', 404)

  try {
    await prisma.accidentPhoto.delete({ where: { id: photo.id } })
  } catch {
    return await apiError('internalError', 500)
  }
  await deleteUpload(photo.url).catch((e) => console.error('[accidents] photo file not removed', e))
  return NextResponse.json({ ok: true })
}
