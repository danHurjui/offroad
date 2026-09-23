import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'

/**
 * Withdraw a shared passport. Owner only, and never gated on Pro — a
 * seller whose subscription lapsed must still be able to take their
 * vehicle's history back down.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; linkId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const vehicle = await requireVehicleOwner(params.id, auth.session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const link = await prisma.passportLink.findUnique({ where: { id: params.linkId } })
  if (!link || link.vehicleId !== vehicle.id) return await apiError('notFound', 404)

  try {
    if (!link.revokedAt) await prisma.passportLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
