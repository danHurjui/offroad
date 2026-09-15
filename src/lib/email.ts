/**
 * Thin Resend wrapper. Falls back to console logging in dev when
 * RESEND_API_KEY is unset, so the password reset flow works without
 * signing up for anything.
 */

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'RigLog <no-reply@riglog.ro>'

  if (!apiKey) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
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
