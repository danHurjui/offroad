import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { resolveUploadPath, StorageError } from '@/lib/storage'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  pdf: 'application/pdf',
}

// Photos/receipts are never served from /public/uploads directly — every
// request re-checks vehicle access here first (see CLAUDE.md pitfall #6).
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const [, vehicleId] = params.path
  if (!vehicleId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const vehicle = await requireVehicleAccess(vehicleId, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const storagePath = params.path.join('/')
    const filePath = resolveUploadPath(storagePath)
    const buffer = await readFile(filePath)
    const ext = storagePath.split('.').pop()?.toLowerCase() ?? ''
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (e) {
    if (e instanceof StorageError) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
