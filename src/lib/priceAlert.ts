import { prisma } from '@/lib/prisma'
import { sendEmail, priceAlertEmailHtml } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'

/**
 * RL-026: pure decision helper (same idempotency pattern as
 * decideReminder() in src/lib/documents.ts) — a price only ever triggers
 * one notification per "arm" of the alert. The caller rearms it by
 * clearing priceAlertSentAt whenever targetPriceRon changes (see PATCH
 * .../wishlist/[itemId]/route.ts).
 */
export function decidePriceAlert(
  priceRon: number,
  targetPriceRon: number | null,
  alreadySentAt: Date | null
): boolean {
  if (targetPriceRon == null || alreadySentAt) return false
  return priceRon <= targetPriceRon
}

/**
 * Notifies the vehicle owner that a wishlist/parts-hunt item hit its
 * price target. Unlike notifyFollowers() (RL-023), there's no per-item
 * opt-out — this is the owner's own alert on their own item, so it
 * always emails (matching the document-reminder pattern) and
 * opportunistically pushes to any of the owner's push subscriptions.
 * Best-effort: never throws back to the caller.
 *
 * Takes vehicleId (not wishlistItemId) so the caller — which already
 * has the vehicle loaded via requireVehicleOwner() — doesn't need a
 * second wishlistItem query just to reach the owner.
 */
export async function notifyPriceAlert(
  vehicleId: string,
  itemName: string,
  priceRon: number,
  targetPriceRon: number
): Promise<void> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      owner: {
        select: {
          email: true,
          pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
        },
      },
    },
  })
  if (!vehicle) return

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const vehicleUrl = `${baseUrl}/dashboard/vehicles/${vehicle.id}/wishlist`

  await sendEmail({
    to: vehicle.owner.email,
    subject: `Price alert: ${itemName} — ${vehicleName}`,
    html: priceAlertEmailHtml({ itemName, priceRon, targetPriceRon, vehicleUrl }),
  }).catch(() => {})

  await Promise.all(
    vehicle.owner.pushSubscriptions.map(async (sub) => {
      const result = await sendPushNotification(sub, {
        title: `${itemName} hit your target price`,
        body: `Found at ${priceRon.toLocaleString('ro-RO')} RON (target ${targetPriceRon.toLocaleString('ro-RO')} RON)`,
        url: vehicleUrl,
      }).catch(() => 'skipped' as const)
      if (result === 'gone') {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      }
    })
  )
}
