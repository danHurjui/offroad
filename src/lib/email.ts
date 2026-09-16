/**
 * Thin Resend wrapper. Falls back to console logging in dev when
 * RESEND_API_KEY is unset, so the password reset flow works without
 * signing up for anything.
 *
 * In **production** that fallback is a trap rather than a convenience: the
 * app would tell someone "a reset link has been sent" while nothing was
 * sent, leaving them locked out with no way to tell why. So an unset key
 * is logged as an error there, and callers for whom a missing email means
 * the operation genuinely failed (password reset) check
 * `isEmailConfigured()` first and refuse rather than pretending.
 */

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/** True when real email can actually be sent (i.e. Resend is configured). */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'RigLog <no-reply@riglog.ro>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      // Loud, because this is silent data loss from the user's point of
      // view — and the fix is one environment variable.
      console.error(
        `[email] RESEND_API_KEY is not set — DROPPED an email to ${to} ("${subject}"). ` +
          `Set RESEND_API_KEY (and EMAIL_FROM on a domain verified in Resend) to actually send mail.`
      )
      return
    }
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`)
    return
  }

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
  } catch (e) {
    console.error(`[email] could not reach Resend for ${to} ("${subject}"):`, e)
    throw new Error('Could not reach the email provider')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Log the provider's own reason. The usual culprit is a 403 because
    // EMAIL_FROM uses a domain that isn't verified in Resend — without
    // this line the operator sees only a generic 500.
    console.error(
      `[email] Resend rejected the message to ${to} ("${subject}"): ${res.status} ${body} ` +
        `(from=${from} — check this domain is verified in Resend)`
    )
    throw new Error(`Resend send failed: ${res.status} ${body}`)
  }
}

export function passwordResetEmailHtml(resetUrl: string): string {
  return `
    <p>Someone requested a password reset for your RigLog account.</p>
    <p><a href="${resetUrl}">Reset your password</a></p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `
}

export function documentReminderEmailHtml(input: {
  documentLabel: string
  vehicleName: string
  daysUntilLabel: string
  vehicleUrl: string
}): string {
  return `
    <p>${input.documentLabel} for your <strong>${input.vehicleName}</strong> ${input.daysUntilLabel}.</p>
    <p><a href="${input.vehicleUrl}">Update it in RigLog</a></p>
  `
}

export function collaboratorInviteEmailHtml(input: {
  inviterName: string
  vehicleName: string
  acceptUrl: string
}): string {
  return `
    <p>${input.inviterName} has invited you to collaborate on their <strong>${input.vehicleName}</strong> on RigLog.</p>
    <p><a href="${input.acceptUrl}">Accept the invite</a></p>
    <p>This link expires in 7 days. Collaborator accounts are always free.</p>
  `
}

export function collaboratorTaskAddedEmailHtml(input: {
  collaboratorName: string
  taskName: string
  vehicleName: string
  vehicleUrl: string
}): string {
  return `
    <p>${input.collaboratorName} added a new task to your <strong>${input.vehicleName}</strong>: ${input.taskName}</p>
    <p><a href="${input.vehicleUrl}">View it in RigLog</a></p>
  `
}

export function paymentFailedEmailHtml(billingUrl: string): string {
  return `
    <p>We couldn't process your latest RigLog Pro payment.</p>
    <p>Stripe will automatically retry the charge — if it keeps failing, your Pro access may be paused. You can
    update your card any time from account settings.</p>
    <p><a href="${billingUrl}">Update payment method</a></p>
  `
}

export function priceAlertEmailHtml(input: {
  itemName: string
  priceRon: number
  targetPriceRon: number
  vehicleUrl: string
}): string {
  return `
    <p>You found <strong>${input.itemName}</strong> at <strong>${input.priceRon.toLocaleString('ro-RO')} RON</strong>,
    at or below your target of ${input.targetPriceRon.toLocaleString('ro-RO')} RON.</p>
    <p><a href="${input.vehicleUrl}">View it in RigLog</a></p>
  `
}

export function followedProjectUpdateEmailHtml(input: { vehicleName: string; message: string; vehicleUrl: string }): string {
  return `
    <p><strong>${input.vehicleName}</strong>, a project you follow on RigLog, just ${input.message}.</p>
    <p><a href="${input.vehicleUrl}">See what's new</a></p>
    <p style="color:#888;font-size:12px">You're getting this because you follow this project. Turn it off any time in your RigLog account settings.</p>
  `
}
