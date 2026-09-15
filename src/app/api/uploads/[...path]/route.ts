import { NextRequest, NextResponse } from 'next/server'
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

// Photos/receipts are never served from /public/uploads (or a raw Blob
// URL) directly — every request re-checks vehicle access here first,
// whichever backend readUpload() is reading from (see CLAUDE.md pitfall #6).
// RL-018: a public vehicle's photos need to load on its public page for a
// logged-out visitor, so this is the one place access is granted without a
// session — gated on vehicle.isPublic, not on who's asking.
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const [, vehicleId] = params.path
  if (!vehicleId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!vehicle.isPublic) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const hasAccess = await requireVehicleAccess(vehicleId, session.user.id)
    if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const storagePath = params.path.join('/')
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
    if (e instanceof StorageError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
