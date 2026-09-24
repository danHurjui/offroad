import { prisma } from '@/lib/prisma'
import { managersSelect, vehicleManagers } from '@/lib/access'
import { translator } from '@/i18n/translator'
import { sendEmail, priceAlertEmail, emailLocale } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'
import { appUrlForNotification } from '@/lib/appUrl'
import { formatAmount } from '@/lib/money'

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
      // RL-038: for a company vehicle, the people who manage it.
      ...managersSelect({
        email: true,
        locale: true,
        pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
      }),
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

  // Each recipient reads it in their own language: the owner, or for a
  // company vehicle each of the people who manage it.
  const recipients = vehicleManagers(vehicle)
  await Promise.all(recipients.map((recipient) => notifyOne(recipient)))

  async function notifyOne(recipient: (typeof recipients)[number]) {
    const locale = emailLocale(recipient)
    const { subject, html } = await priceAlertEmail(locale, {
      itemName,
      vehicleName,
      priceRon,
      targetPriceRon,
      vehicleUrl,
    })
    await sendEmail({ to: recipient.email, subject, html }).catch(() => {})

    // Push goes to the same person, so it reads in the same language.
    const tPush = await translator(locale, 'notify')

    await Promise.all(
      recipient.pushSubscriptions.map(async (sub) => {
        const result = await sendPushNotification(sub, {
          title: tPush('priceAlertTitle', { item: itemName }),
          body: tPush('priceAlertBody', {
            price: formatAmount(priceRon),
            target: formatAmount(targetPriceRon),
          }),
          url: vehicleUrl,
        }).catch(() => 'skipped' as const)
        if (result === 'gone') {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }
      })
    )
  }
}
