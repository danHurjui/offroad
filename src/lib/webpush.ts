import webpush from 'web-push'

/**
 * RL-023: thin Web Push wrapper. Falls back to a silent no-op when
 * VAPID keys aren't configured (dev without push set up), matching the
 * pattern of src/lib/email.ts's console-log fallback — push is a
 * progressive enhancement, not a hard requirement for the follow feature
 * to work (email notifications still fire independently).
 */
let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:support@riglog.ro', publicKey, privateKey)
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
    console.log(`[push:dev] to=${subscription.endpoint} title="${payload.title}"`)
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
    throw e
  }
}
