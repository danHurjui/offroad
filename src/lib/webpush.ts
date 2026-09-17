import webpush from 'web-push'

/**
 * RL-023: thin Web Push wrapper. Falls back to a no-op when VAPID keys
 * aren't configured, matching src/lib/email.ts's console-log fallback —
 * push is a progressive enhancement, not a hard requirement for the follow
 * feature to work, since email notifications fire independently.
 *
 * In production that fallback is loud, for the same reason email's is: a
 * person who enabled notifications, granted the browser permission and
 * saw "notifications on" is being told something untrue, and the fix is
 * three environment variables. Quiet in development, where not having set
 * push up is the normal state.
 */
let configured = false

/** Whether real push can actually be sent. */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let warned = false
function warnUnconfigured(): void {
  if (warned || process.env.NODE_ENV !== 'production') return
  warned = true
  console.error(
    '[push] VAPID keys are not configured — every push notification is being dropped, including ' +
      'for subscribers who granted permission. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and ' +
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY (the same value as the public one), then redeploy. ' +
      'See DEPLOY.md, "Configure Web Push". Email notifications are unaffected.'
  )
}

function ensureConfigured(): boolean {
  if (configured) return true
  if (!isPushConfigured()) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:support@riglog.ro',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  )
  configured = true
  return true
}

export interface PushSubscriptionLike {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

/**
 * Returns 'sent', 'skipped' (push not configured), or 'gone' (the
 * subscription is dead — a 404/410 from the push service — the caller
 * should delete this PushSubscription row).
 */
export async function sendPushNotification(
  subscription: PushSubscriptionLike,
  payload: PushPayload
): Promise<'sent' | 'skipped' | 'gone'> {
  if (!ensureConfigured()) {
    // Once per process, not once per subscriber: a project with followers
    // would otherwise fill the log with the same line on every cron run.
    warnUnconfigured()
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[push:dev] to=${subscription.endpoint} title="${payload.title}"`)
    }
    return 'skipped'
  }

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    )
    return 'sent'
  } catch (e) {
    const statusCode = (e as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) return 'gone'
    // 401/403 here means the keys are set but wrong — typically
    // NEXT_PUBLIC_VAPID_PUBLIC_KEY not matching VAPID_PUBLIC_KEY, so the
    // subscription was minted against a different application server key
    // than the one signing this. Worth saying, because everything looks
    // configured.
    if (statusCode === 401 || statusCode === 403) {
      console.error(
        `[push] the push service rejected our credentials (${statusCode}). VAPID_PUBLIC_KEY and ` +
          'NEXT_PUBLIC_VAPID_PUBLIC_KEY must be the same value, and subscriptions taken under an ' +
          'older key pair no longer work — those subscribers have to re-enable notifications.'
      )
    }
    throw e
  }
}
