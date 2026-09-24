import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { serializeTrailRun } from '@/lib/serialize'
import { deleteUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

async function loadRun(vehicleId: string, runId: string) {
  const run = await prisma.trailRun.findUnique({ where: { id: runId }, include: { waypoints: true } })
  if (!run || run.vehicleId !== vehicleId) return null
  return run
}

export async function GET(_req: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const run = await loadRun(params.id, params.runId)
  if (!run) return await apiError('notFound', 404)

  return NextResponse.json(serializeTrailRun(run))
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const run = await loadRun(params.id, params.runId)
  if (!run) return await apiError('notFound', 404)

  try {
    await Promise.all(run.waypoints.filter((w) => w.photoUrl).map((w) => deleteUpload(w.photoUrl!)))
    await prisma.trailRun.delete({ where: { id: run.id } })
    return NextResponse.json({ message: 'Trail run deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}
