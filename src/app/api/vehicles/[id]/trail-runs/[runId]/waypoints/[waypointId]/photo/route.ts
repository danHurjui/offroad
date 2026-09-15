import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { saveUpload, StorageError, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '@/lib/storage'

// RL-027: attach a photo to a waypoint after the run is saved — photos
// are captured live during recording but uploaded here as a separate
// multipart request (matching the task-photos upload pattern), since a
// File can't ride along in the JSON trail-run create payload.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; runId: string; waypointId: string } }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const waypoint = await prisma.trailWaypoint.findUnique({ where: { id: params.waypointId } })
  if (!waypoint || waypoint.trailRunId !== params.runId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const run = await prisma.trailRun.findUnique({ where: { id: params.runId } })
  if (!run || run.vehicleId !== vehicle.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = await saveUpload(vehicle.ownerId, vehicle.id, file.name, buffer, file.type)

    const updated = await prisma.trailWaypoint.update({ where: { id: waypoint.id }, data: { photoUrl: storagePath } })
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof StorageError) return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
