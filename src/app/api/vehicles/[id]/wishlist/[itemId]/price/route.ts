import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { serializeWishlistPriceEntry } from '@/lib/serialize'
import { toNumberOrNull } from '@/lib/serialize'
import { decidePriceAlert, notifyPriceAlert } from '@/lib/priceAlert'
import { readJsonBody } from '@/lib/requestBody'

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
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await loadItem(params.id, params.itemId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isPro: true } })
  if (!owner?.isPro) {
    return NextResponse.json(
      { error: 'Price alerts are a Pro feature.', code: 'UPGRADE_REQUIRED' },
      { status: 403 }
    )
  }

  const item = await loadItem(params.id, params.itemId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const priceRon = Number(body.priceRon)
    if (!Number.isFinite(priceRon) || priceRon <= 0) {
      return NextResponse.json({ error: 'priceRon must be a positive number' }, { status: 400 })
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
