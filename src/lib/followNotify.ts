import { prisma } from '@/lib/prisma'
import { sendEmail, followedProjectUpdateEmailHtml } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'

/**
 * RL-023: notifies everyone following `vehicleId` — email and/or push per
 * each follower's own User-level toggles (notifyFollowedEmail/Push).
 * Called from the task PATCH route (status → completeStatus) and the
 * task photos POST route. Best-effort: a failure to notify one follower
 * (or one of their devices) never throws back to the caller — this runs
 * after the triggering write has already succeeded.
 */
export async function notifyFollowers(vehicleId: string, message: string): Promise<void> {
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
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  // A follower is never the owner or a collaborator, so this has to be
  // the public profile URL — /dashboard/vehicles/[id] would 404 for them.
  const vehicleUrl = `${baseUrl}/builds/${vehicle.owner.username}/${vehicle.slug}`

  await Promise.all(
    follows.map(async ({ follower }) => {
      if (follower.notifyFollowedEmail) {
        await sendEmail({
          to: follower.email,
          subject: `${vehicleName} — update on RigLog`,
          html: followedProjectUpdateEmailHtml({ vehicleName, message, vehicleUrl }),
        }).catch(() => {})
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
