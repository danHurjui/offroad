import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/** Removing a cost. Owner: any; collaborator: their own (pitfall #4). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; expenseId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const expense = await prisma.vehicleExpense.findUnique({ where: { id: params.expenseId } })
  if (!expense || expense.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && expense.createdByUserId !== session.user.id) {
    return await apiError('expenseOwnOnly', 403)
  }

  try {
    await prisma.vehicleExpense.delete({ where: { id: expense.id } })
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
