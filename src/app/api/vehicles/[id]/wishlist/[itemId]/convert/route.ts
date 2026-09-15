import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { PROJECT_TYPE_CONFIG, isValidTaskVocabulary } from '@/lib/projectType'
import { serializeTask, toNumberOrNull } from '@/lib/serialize'

/**
 * RL-011/012 "Mark as installed" / "Mark as fitted" — converts a wishlist
 * item into a build task (RL-004), fields pre-filled, and marks the item
 * with the mode's terminal wishlist status (INSTALLED / FITTED) rather
 * than deleting it, so the wishlist keeps a record of what was bought.
 *
 * The item's category is required on the task; if the item never had one
 * set, the caller must supply `category` in the request body.
 *
 * partCondition is NOT copied to the task's originalityCondition: the two
 * fields use different vocabularies (sourcing condition — NOS/good used/
 * needs work/reproduction — vs. authenticity — OEM original/period
 * correct/modern replacement/reproduction), and only "reproduction"
 * happens to overlap. Set originalityCondition on the task afterward if
 * it applies.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await prisma.wishlistItem.findUnique({ where: { id: params.itemId } })
  if (!item || item.vehicleId !== vehicle.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const body = await req.json().catch(() => ({}))
    const category = body.category || item.category
    const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
    const terminalStatus = config.completeStatus

    if (!category || !isValidTaskVocabulary(vehicle.projectType, category, terminalStatus)) {
      return NextResponse.json(
        { error: 'This item needs a valid category before it can become a task — pass one in the request body' },
        { status: 400 }
      )
    }

    const terminalWishlistStatus = config.wishlistStatuses[config.wishlistStatuses.length - 1].value

    const [task] = await prisma.$transaction([
      prisma.task.create({
        data: {
          vehicleId: vehicle.id,
          addedByUserId: session.user.id,
          name: item.name,
          category,
          status: terminalStatus,
          workType: 'DIY',
          costRon: toNumberOrNull(item.estimatedCostRon),
          date: new Date(),
          supplierUrl: item.supplierUrl,
          notes: item.notes,
        },
      }),
      prisma.wishlistItem.update({ where: { id: item.id }, data: { status: terminalWishlistStatus } }),
      prisma.vehicle.update({ where: { id: vehicle.id }, data: { updatedAt: new Date() } }),
    ])

    return NextResponse.json(serializeTask(task), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
