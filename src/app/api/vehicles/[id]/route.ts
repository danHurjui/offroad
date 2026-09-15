import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess, requireVehicleOwner } from '@/lib/access'

const CURRENT_YEAR_PLUS_ONE = new Date().getFullYear() + 1

// RL-003: project dashboard reads the vehicle plus its tasks/found state.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const [tasks, foundState] = await Promise.all([
      prisma.task.findMany({
        where: { vehicleId: vehicle.id },
        orderBy: { updatedAt: 'desc' },
        include: { photos: true },
      }),
      vehicle.projectType === 'RESTORATION'
        ? prisma.foundState.findUnique({ where: { vehicleId: vehicle.id }, include: { photos: true } })
        : Promise.resolve(null),
    ])
    return NextResponse.json({ vehicle, tasks, foundState, isOwner: vehicle.ownerId === session.user.id })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Vehicle settings edit — owner only. projectType is intentionally not
// editable here (see CLAUDE.md pitfall #2).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.make !== undefined) data.make = String(body.make)
    if (body.model !== undefined) data.model = String(body.model)
    if (body.year !== undefined) {
      const yearNum = Number(body.year)
      if (!Number.isInteger(yearNum) || yearNum < 1886 || yearNum > CURRENT_YEAR_PLUS_ONE) {
        return NextResponse.json({ error: 'year must be a valid 4-digit year' }, { status: 400 })
      }
      data.year = yearNum
    }
    if (body.generation !== undefined) data.generation = body.generation || null
    if (body.engine !== undefined) data.engine = body.engine || null
    if (body.vin !== undefined) data.vin = body.vin || null
    if (body.coverPhotoUrl !== undefined) data.coverPhotoUrl = body.coverPhotoUrl || null
    if (body.isPublic !== undefined) data.isPublic = Boolean(body.isPublic)
    if (body.hideCostsFromCollaborators !== undefined) data.hideCostsFromCollaborators = Boolean(body.hideCostsFromCollaborators)

    const updated = await prisma.vehicle.update({ where: { id: vehicle.id }, data })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await prisma.vehicle.delete({ where: { id: vehicle.id } })
    return NextResponse.json({ message: 'Vehicle deleted' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
