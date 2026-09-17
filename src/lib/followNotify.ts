import { prisma } from '@/lib/prisma'
import { translator } from '@/i18n/translator'
import { sendEmail, followedProjectUpdateEmail, emailLocale } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'
import { appUrlForNotification } from '@/lib/appUrl'

/** What happened, as a catalogue key plus its values. */
export interface FollowUpdate {
  /** A key under the `notify` namespace. */
  key: string
  values?: Record<string, string>
}

/**
 * RL-023: notifies everyone following `vehicleId` — email and/or push per
 * each follower's own User-level toggles (notifyFollowedEmail/Push).
 * Called from the task PATCH route (status → completeStatus) and the
 * task photos POST route. Best-effort: a failure to notify one follower
 * (or one of their devices) never throws back to the caller — this runs
 * after the triggering write has already succeeded.
 *
 * `update` is a catalogue key rather than a finished sentence: every
 * follower reads this in their own language, so the same event has to be
 * rendered once per follower rather than once per event.
 */
export async function notifyFollowers(vehicleId: string, update: FollowUpdate): Promise<void> {
  const [vehicle, follows] = await Promise.all([
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { year: true, make: true, model: true, slug: true, owner: { select: { username: true } } },
    }),
    prisma.follow.findMany({
      where: { vehicleId },
      include: {
        follower: {
          select: {
            email: true,
            locale: true,
            notifyFollowedEmail: true,
            notifyFollowedPush: true,
            pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
          },
        },
      },
    }),
  ])
  if (!vehicle || follows.length === 0) return

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const baseUrl = appUrlForNotification('the follower notification')
  if (!baseUrl) return
  // A follower is never the owner or a collaborator, so this has to be
  // the public profile URL — /dashboard/vehicles/[id] would 404 for them.
  const vehicleUrl = `${baseUrl}/builds/${vehicle.owner.username}/${vehicle.slug}`

  await Promise.all(
    follows.map(async ({ follower }) => {
      const locale = emailLocale(follower)
      const t = await translator(locale, 'notify')
      const message = t(update.key, update.values)

      if (follower.notifyFollowedEmail) {
        const { subject, html } = await followedProjectUpdateEmail(locale, {
          vehicleName,
          message,
          vehicleUrl,
        })
        await sendEmail({ to: follower.email, subject, html }).catch(() => {})
      }
      if (follower.notifyFollowedPush) {
        await Promise.all(
          follower.pushSubscriptions.map(async (sub) => {
            const result = await sendPushNotification(sub, { title: vehicleName, body: message, url: vehicleUrl }).catch(
              () => 'skipped' as const
            )
            if (result === 'gone') {
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
            }
          })
        )
      }
    })
  )
}
