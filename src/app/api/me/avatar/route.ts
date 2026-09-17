import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { saveUpload, deleteUpload, StorageError, MAX_UPLOAD_BYTES } from '@/lib/storage'
import { readFormData } from '@/lib/requestBody'

/**
 * The profile picture.
 *
 * `User.avatarUrl` is a storage key, like every other file reference in
 * this app — and it is written *only here*. `PATCH /api/me` deliberately
 * does not accept it: the column is streamed back out by
 * `/api/avatars/[userId]` with no access check of its own (a profile
 * picture is public by nature), so a route that let a client put an
 * arbitrary key in it would be an exfiltration path — point it at someone
 * else's receipt and fetch your own avatar.
 *
 * PDFs are excluded, unlike other uploads: this one is rendered as an
 * image and nothing else.
 */
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/heic']

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsedForm = await readFormData(req)
  if (!parsedForm.ok) return parsedForm.error
  const formData = parsedForm.form

  try {
    const file = formData.get('file')
    if (!(file instanceof File)) return await apiError('fileRequired', 400)
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return await apiError('unsupportedFileType', 400)
    if (file.size > MAX_UPLOAD_BYTES) {
      return await apiErrorWith('fileTooLarge', { maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 }, 400)
    }

    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatarUrl: true },
    })

    const buffer = Buffer.from(await file.arrayBuffer())
    // The second segment is a storage folder, not a vehicle: avatars are
    // not served through /api/uploads/[...path], which resolves that
    // segment as a vehicle id and would 404 on every one of them.
    const storagePath = await saveUpload(session.user.id, 'avatar', file.name, buffer, file.type)

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl: storagePath },
      select: { avatarUrl: true },
    })
    // Pitfall #14: the row points elsewhere now, so the old image would
    // otherwise survive every replacement and the account's erasure.
    if (existing?.avatarUrl) await deleteUpload(existing.avatarUrl)

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof StorageError) return await apiError('savePhotoFailed', 500)
    return await apiError('internalError', 500)
  }
}

export async function DELETE() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatarUrl: true },
    })
    if (!existing?.avatarUrl) return NextResponse.json({ avatarUrl: null })

    await prisma.user.update({ where: { id: session.user.id }, data: { avatarUrl: null } })
    await deleteUpload(existing.avatarUrl)

    return NextResponse.json({ avatarUrl: null })
  } catch {
    return await apiError('internalError', 500)
  }
}
