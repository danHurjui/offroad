import { prisma } from '@/lib/prisma'
import { translator } from '@/i18n/translator'
import { sendEmail, priceAlertEmail, emailLocale } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'
import { appUrlForNotification } from '@/lib/appUrl'

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
          locale: true,
          pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
        },
      },
    },
  })
  if (!vehicle) return

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  // Without an origin every link in this notification would read
  // "null/dashboard/..." — template strings stringify null happily, which
  // is how the old inline fallback hid this class of bug.
  const baseUrl = appUrlForNotification('the price-alert notification')
  if (!baseUrl) return
  const vehicleUrl = `${baseUrl}/dashboard/vehicles/${vehicle.id}/wishlist`

  const locale = emailLocale(vehicle.owner)
  const { subject, html } = await priceAlertEmail(locale, {
    itemName,
    vehicleName,
    priceRon,
    targetPriceRon,
    vehicleUrl,
  })
  await sendEmail({ to: vehicle.owner.email, subject, html }).catch(() => {})

  // Push goes to the same person, so it reads in the same language.
  const tPush = await translator(locale, 'notify')

  await Promise.all(
    vehicle.owner.pushSubscriptions.map(async (sub) => {
      const result = await sendPushNotification(sub, {
        title: tPush('priceAlertTitle', { item: itemName }),
        body: tPush('priceAlertBody', {
          price: priceRon.toLocaleString('ro-RO'),
          target: targetPriceRon.toLocaleString('ro-RO'),
        }),
        url: vehicleUrl,
      }).catch(() => 'skipped' as const)
      if (result === 'gone') {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      }
    })
  )
}
