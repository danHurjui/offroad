import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'

// RL-007: full project visual log, filterable by photo type and category.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const { searchParams } = new URL(req.url)
    const photoType = searchParams.get('photoType')
    const category = searchParams.get('category')
    const order = searchParams.get('order') === 'oldest' ? 'asc' : 'desc'

    const photos = await prisma.taskPhoto.findMany({
      where: {
        vehicleId: vehicle.id,
        ...(photoType ? { photoType } : {}),
        ...(category ? { task: { category } } : {}),
      },
      orderBy: { createdAt: order },
      include: { task: { select: { id: true, name: true, category: true, date: true } } },
    })

    return NextResponse.json(photos)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
