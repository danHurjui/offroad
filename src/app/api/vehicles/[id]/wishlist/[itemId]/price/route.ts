import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { serializeWishlistPriceEntry } from '@/lib/serialize'
import { toNumberOrNull } from '@/lib/serialize'
import { decidePriceAlert, notifyPriceAlert } from '@/lib/priceAlert'
import { readJsonBody } from '@/lib/requestBody'
import { hasPro, PRO_SELECT } from '@/lib/pro'

async function loadItem(vehicleId: string, itemId: string) {
  const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } })
  if (!item || item.vehicleId !== vehicleId) return null
  return item
}

// RL-026: price history for the wishlist item detail page's chart.
export async function GET(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const item = await loadItem(params.id, params.itemId)
  if (!item) return await apiError('notFound', 404)

  const entries = await prisma.wishlistPriceEntry.findMany({
    where: { wishlistItemId: item.id },
    orderBy: { recordedAt: 'asc' },
  })
  return NextResponse.json(entries.map(serializeWishlistPriceEntry))
}

// "I found it at this price" — the manual alternative to automated
// scraping (see the schema comment on WishlistItem.targetPriceRon).
// Pro-gated: price alerts are a Pro feature per the ticket.
export async function POST(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (!hasPro(owner)) {
    return await apiError('proPriceAlerts', 403, { code: 'UPGRADE_REQUIRED' })
  }

  const item = await loadItem(params.id, params.itemId)
  if (!item) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const priceRon = Number(body.priceRon)
    if (!Number.isFinite(priceRon) || priceRon <= 0) {
      return await apiError('priceInvalid', 400)
    }
    const note = typeof body.note === 'string' && body.note ? body.note : null

    const entry = await prisma.wishlistPriceEntry.create({
      data: { wishlistItemId: item.id, priceRon, note },
    })

    const targetPriceRon = toNumberOrNull(item.targetPriceRon)
    if (decidePriceAlert(priceRon, targetPriceRon, item.priceAlertSentAt)) {
      await prisma.wishlistItem.update({ where: { id: item.id }, data: { priceAlertSentAt: new Date() } })
      await notifyPriceAlert(vehicle.id, item.name, priceRon, targetPriceRon as number)
    }

    return NextResponse.json(serializeWishlistPriceEntry(entry), { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
