import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { vehicleAccessFor } from '@/lib/access'

// RL-023: follow/unfollow a public project. Not gated by
// requireVehicleAccess — that's for owner/collaborator access, and a
// follower is neither; any public vehicle can be followed by anyone
// logged in except its own owner.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await prisma.vehicle.findUnique({ where: { id: params.id }, select: { id: true, isPublic: true, ownerId: true, organizationId: true } })
  if (!vehicle || !vehicle.isPublic) return await apiError('notFound', 404)
  if ((await vehicleAccessFor(vehicle, session.user.id, { ownerOnly: true })) === 'owner') {
    return NextResponse.json({ error: "You can't follow your own project" }, { status: 400 })
  }

  await prisma.follow.upsert({
    where: { vehicleId_followerUserId: { vehicleId: vehicle.id, followerUserId: session.user.id } },
    update: {},
    create: { vehicleId: vehicle.id, followerUserId: session.user.id },
  })

  const followerCount = await prisma.follow.count({ where: { vehicleId: vehicle.id } })
  return NextResponse.json({ following: true, followerCount })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  await prisma.follow
    .delete({ where: { vehicleId_followerUserId: { vehicleId: params.id, followerUserId: session.user.id } } })
    .catch(() => {}) // not following — deleting is idempotent

  const followerCount = await prisma.follow.count({ where: { vehicleId: params.id } })
  return NextResponse.json({ following: false, followerCount })
}
