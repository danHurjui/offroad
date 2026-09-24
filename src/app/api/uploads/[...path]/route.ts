import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVehicleAccess } from '@/lib/access'
import { readUpload, StorageError } from '@/lib/storage'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  pdf: 'application/pdf',
}

// A storage key is always exactly <userId>/<vehicleId>/<filename> — the
// shape saveUpload() writes. The id segments are the same charset
// safeSegment() enforces on write; the filename adds '.' for its extension.
// Nothing else is a valid key, and validating the shape here is what keeps
// the access decision and the file read talking about the *same* vehicle:
// the vehicleId we authorise against (segment 1) is, after this check, the
// one that actually owns the bytes readUpload() returns. Without it a
// `..` segment could point the read at another vehicle's file while the
// access check still saw a public vehicle in segment 1 (see #114).
const ID_SEGMENT = /^[a-zA-Z0-9_-]+$/
const FILE_SEGMENT = /^[a-zA-Z0-9_.-]+$/

function parseStorageKey(path: string[]): { vehicleId: string; storagePath: string } | null {
  if (path.length !== 3) return null
  const [userId, vehicleId, filename] = path
  if (!ID_SEGMENT.test(userId) || !ID_SEGMENT.test(vehicleId) || !FILE_SEGMENT.test(filename)) return null
  // Redundant given the charset above, but explicit so the intent survives
  // any future loosening of the patterns.
  if (filename === '.' || filename === '..') return null
  return { vehicleId, storagePath: `${userId}/${vehicleId}/${filename}` }
}

// Photos/receipts are never served from /public/uploads (or a raw Blob
// URL) directly — every request re-checks vehicle access here first,
// whichever backend readUpload() is reading from (see CLAUDE.md pitfall #6).
// RL-018: a public vehicle's photos need to load on its public page for a
// logged-out visitor, so this is the one place access is granted without a
// session — gated on vehicle.isPublic, not on who's asking.
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const key = parseStorageKey(params.path)
  if (!key) return await apiError('notFound', 404)
  const { vehicleId, storagePath } = key

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle) return await apiError('notFound', 404)

  if (!vehicle.isPublic) {
    const session = await getServerSession(authOptions)
    if (!session) return await apiError('unauthorized', 401)
    const hasAccess = await requireVehicleAccess(vehicleId, session.user.id)
    if (!hasAccess) return await apiError('notFound', 404)
  }

  try {
    const { buffer, contentType } = await readUpload(storagePath)
    const ext = storagePath.split('.').pop()?.toLowerCase() ?? ''
    const resolvedContentType = contentType ?? CONTENT_TYPES[ext] ?? 'application/octet-stream'

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': resolvedContentType,
        'Cache-Control': vehicle.isPublic ? 'public, max-age=3600' : 'private, max-age=3600',
      },
    })
  } catch (e) {
    if (e instanceof StorageError) return await apiError('notFound', 404)
    return await apiError('internalError', 500)
  }
}
