import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { readUpload, StorageError } from '@/lib/storage'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
}

/**
 * Serves a profile picture.
 *
 * Deliberately separate from `/api/uploads/[...path]`, which reads the
 * second path segment as a vehicle id and checks access against it — an
 * avatar belongs to no vehicle, so every one of them would 404 there.
 *
 * No session, because a profile picture appears on a public build page
 * next to the owner's name, and gating it would leave a broken image for
 * every logged-out reader. That is safe here in a way a general file route
 * would not be: **the client never supplies a path**. The only key this
 * can ever read is the one on the row, which only `/api/me/avatar` writes.
 */
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { avatarUrl: true },
  })
  if (!user?.avatarUrl) return await apiError('notFound', 404)

  try {
    const { buffer, contentType } = await readUpload(user.avatarUrl)
    const ext = user.avatarUrl.split('.').pop()?.toLowerCase() ?? ''
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType ?? CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    if (e instanceof StorageError) return await apiError('notFound', 404)
    return await apiError('internalError', 500)
  }
}
