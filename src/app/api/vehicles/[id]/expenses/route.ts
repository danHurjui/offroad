import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseExpense } from '@/lib/ownershipCosts'
import { toNumberOrNull } from '@/lib/serialize'

/**
 * RL-045: the long tail of running costs — road tax, tolls, parking,
 * washes, fines. Owner and active collaborators, like fuel (the driver is
 * the one paying the toll); no rate limit rule, like every private garage
 * write.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const expense = parseExpense(parsed.body)
  if (!expense.ok) return await apiErrorWith('expenseFieldInvalid', { field: expense.field }, 400)

  try {
    const created = await prisma.vehicleExpense.create({
      data: { vehicleId: vehicle.id, ...expense.data, createdByUserId: session.user.id },
    })
    return NextResponse.json({ ...created, amountRon: toNumberOrNull(created.amountRon) }, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
