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
