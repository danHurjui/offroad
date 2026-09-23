import { isLocale, toLocale, type Locale } from '@/i18n/config'
import { translator } from '@/i18n/translator'
/**
 * Transactional email, over Brevo or Resend.
 *
 * Which one is used is a config choice, not a code change: whichever API
 * key is set wins, Brevo first. Keeping both means switching providers (or
 * switching back) is an environment-variable edit, and nothing here leaks
 * past `sendEmail()` — the eight call sites don't know or care.
 *
 * With neither key set, this falls back to console logging. That is a
 * convenience in dev and a trap in **production**: the app would tell
 * someone "a reset link has been sent" while nothing was sent, leaving
 * them locked out with no way to tell why. So an unset key is logged as an
 * error there, and callers for whom a missing email means the operation
 * genuinely failed (password reset) check `isEmailConfigured()` first and
 * refuse rather than pretending.
 */

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export type EmailProvider = 'brevo' | 'resend'

const DEFAULT_FROM = 'RigLog <no-reply@riglog.ro>'

/**
 * Which provider will actually be used, or null when none is configured.
 * Brevo takes precedence so that setting BREVO_API_KEY is enough to switch
 * without having to remember to clear the old key.
 */
export function emailProvider(): EmailProvider | null {
  if (process.env.BREVO_API_KEY) return 'brevo'
  if (process.env.RESEND_API_KEY) return 'resend'
  return null
}

/** True when real email can actually be sent. */
export function isEmailConfigured(): boolean {
  return emailProvider() !== null
}

/**
 * Splits `EMAIL_FROM` into the name/address pair Brevo wants.
 *
 * The env var keeps the familiar `Name <addr@example.com>` form that
 * Resend takes verbatim, so switching providers doesn't mean rewriting
 * config. A bare address (no angle brackets) is accepted too.
 */
export function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (match) {
    const name = match[1].replace(/^"|"$/g, '').trim()
    return { ...(name ? { name } : {}), email: match[2].trim() }
  }
  return { email: from.trim() }
}

async function sendViaBrevo(apiKey: string, from: string, { to, subject, html }: SendEmailInput) {
  const sender = parseSender(from)
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      // Brevo authenticates with its own header, not a Bearer token.
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  })
}

async function sendViaResend(apiKey: string, from: string, { to, subject, html }: SendEmailInput) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
}

/** What to check when a provider rejects the message. */
function rejectionHint(provider: EmailProvider, from: string): string {
  return provider === 'brevo'
    ? `(from=${from} — this exact address must be a verified sender, or on a verified domain, in Brevo)`
    : `(from=${from} — check this domain is verified in Resend)`
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { to, subject, html } = input
  const provider = emailProvider()
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM

  if (!provider) {
    if (process.env.NODE_ENV === 'production') {
      // Loud, because this is silent data loss from the user's point of
      // view — and the fix is one environment variable.
      console.error(
        `[email] no email provider configured — DROPPED an email to ${to} ("${subject}"). ` +
          `Set BREVO_API_KEY (or RESEND_API_KEY), plus EMAIL_FROM on a verified sender.`
      )
      return
    }
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`)
    return
  }

  let res: Response
  try {
    res =
      provider === 'brevo'
        ? await sendViaBrevo(process.env.BREVO_API_KEY!, from, input)
        : await sendViaResend(process.env.RESEND_API_KEY!, from, input)
  } catch (e) {
    console.error(`[email] could not reach ${provider} for ${to} ("${subject}"):`, e)
    throw new Error('Could not reach the email provider')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Log the provider's own reason. The usual culprit is an unverified
    // sender — without this line the operator sees only a generic 500.
    console.error(
      `[email] ${provider} rejected the message to ${to} ("${subject}"): ${res.status} ${body} ` +
        rejectionHint(provider, from)
    )
    throw new Error(`${provider} send failed: ${res.status} ${body}`)
  }
}

/**
 * ## The templates
 *
 * Every builder below takes the **recipient's** locale and returns both
 * the subject and the body, because those two always have to agree: a
 * Romanian subject over an English body is worse than either alone.
 *
 * The locale is the recipient's `User.locale`, not the browser cookie of
 * whoever caused the send. A document reminder is dispatched by a nightly
 * cron job with no browser anywhere near it, and a collaborator invite is
 * sent by one person to another. `getTranslations({ locale })` is what
 * makes that explicit — see src/i18n/request.ts, which honours a
 * requested locale ahead of the request's own.
 *
 * `emailLocale()` is the one place that turns a possibly-null column into
 * a language, so a row that predates the chooser falls to Romanian rather
 * than rendering `email.passwordReset.subject` into someone's inbox.
 */

export interface EmailContent {
  subject: string
  html: string
}

/** The recipient's language, tolerating a null or unknown column. */
export function emailLocale(user: { locale?: string | null } | null | undefined): Locale {
  return toLocale(user?.locale)
}

/**
 * The language to write to an address that may not have an account yet —
 * a collaborator invitation.
 *
 * Their own preference when they have one; otherwise the sender's, which
 * is the only signal there is: somebody inviting their mechanic knows
 * which language that mechanic reads better than a default does.
 */
export function inviteeLocale(
  invitee: { locale?: string | null } | null | undefined,
  inviter: { locale?: string | null } | null | undefined
): Locale {
  return isLocale(invitee?.locale) ? invitee.locale : emailLocale(inviter)
}

/** The `email` namespace in a given language. */
async function strings(locale: Locale) {
  return translator(locale, 'email')
}

/**
 * Escapes a value before it is interpolated into email HTML.
 *
 * Vehicle names, task names and display names are all user-typed, and
 * they end up inside a `<p>` in somebody else's inbox — a collaborator
 * invite carries the *inviter's* chosen name to a stranger. Mail clients
 * sanitise aggressively, so this is belt-and-braces rather than a live
 * hole, but the values are untrusted and this is where they stop being
 * treated as markup.
 */
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Bold, after escaping — the catalogue carries no markup of its own. */
function strong(value: string | number): string {
  return `<strong>${esc(value)}</strong>`
}

function layout(paragraphs: string[]): string {
  return `\n${paragraphs.map((line) => `    ${line}`).join('\n')}\n  `
}

export async function passwordResetEmail(locale: Locale, resetUrl: string): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('passwordReset.subject'),
    html: layout([
      `<p>${t('passwordReset.intro')}</p>`,
      `<p><a href="${resetUrl}">${t('passwordReset.cta')}</a></p>`,
      `<p>${t('passwordReset.ignore')}</p>`,
    ]),
  }
}

/**
 * The link that proves a new account can read the address on it.
 *
 * Carries the expiry in the body: a link that silently stopped working
 * overnight is the most common reason somebody gives up on a signup, and
 * knowing it lapsed is what tells them to ask for another rather than to
 * keep clicking the dead one.
 */
export async function verifyEmailEmail(locale: Locale, verifyUrl: string): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('verifyEmail.subject'),
    html: layout([
      `<p>${t('verifyEmail.intro')}</p>`,
      `<p><a href="${verifyUrl}">${t('verifyEmail.cta')}</a></p>`,
      `<p>${t('verifyEmail.expiry')}</p>`,
      `<p>${t('verifyEmail.ignore')}</p>`,
    ]),
  }
}

export async function documentReminderEmail(
  locale: Locale,
  input: { documentLabel: string; vehicleName: string; daysUntilLabel: string; vehicleUrl: string }
): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('documentReminder.subject', {
      document: input.documentLabel,
      daysUntil: input.daysUntilLabel,
    }),
    html: layout([
      `<p>${t('documentReminder.body', {
        document: esc(input.documentLabel),
        vehicle: strong(input.vehicleName),
        daysUntil: esc(input.daysUntilLabel),
      })}</p>`,
      `<p><a href="${input.vehicleUrl}">${t('documentReminder.cta')}</a></p>`,
    ]),
  }
}

export async function collaboratorInviteEmail(
  locale: Locale,
  input: { inviterName: string; vehicleName: string; acceptUrl: string }
): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('collaboratorInvite.subject', { inviter: input.inviterName }),
    html: layout([
      `<p>${t('collaboratorInvite.body', {
        inviter: esc(input.inviterName),
        vehicle: strong(input.vehicleName),
      })}</p>`,
      `<p><a href="${input.acceptUrl}">${t('collaboratorInvite.cta')}</a></p>`,
      `<p>${t('collaboratorInvite.expiry')}</p>`,
    ]),
  }
}

/** RL-038: an invitation to join an organisation with a role. */
export async function organizationInviteEmail(
  locale: Locale,
  input: { inviterName: string; organizationName: string; role: string; acceptUrl: string }
): Promise<EmailContent> {
  const t = await strings(locale)
  const roles = await translator(locale, 'organizations')
  return {
    subject: t('organizationInvite.subject', { inviter: input.inviterName, organization: input.organizationName }),
    html: layout([
      `<p>${t('organizationInvite.body', {
        inviter: esc(input.inviterName),
        organization: strong(input.organizationName),
        role: esc(roles(`role.${input.role}`)),
      })}</p>`,
      `<p><a href="${input.acceptUrl}">${t('organizationInvite.cta')}</a></p>`,
      `<p>${t('organizationInvite.expiry')}</p>`,
    ]),
  }
}

export async function collaboratorTaskAddedEmail(
  locale: Locale,
  input: { collaboratorName: string; taskName: string; vehicleName: string; vehicleUrl: string }
): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('taskAdded.subject', { collaborator: input.collaboratorName }),
    html: layout([
      `<p>${t('taskAdded.body', {
        collaborator: esc(input.collaboratorName),
        vehicle: strong(input.vehicleName),
        task: esc(input.taskName),
      })}</p>`,
      `<p><a href="${input.vehicleUrl}">${t('taskAdded.cta')}</a></p>`,
    ]),
  }
}

export async function paymentFailedEmail(locale: Locale, billingUrl: string): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('paymentFailed.subject'),
    html: layout([
      `<p>${t('paymentFailed.intro')}</p>`,
      `<p>${t('paymentFailed.body')}</p>`,
      `<p><a href="${billingUrl}">${t('paymentFailed.cta')}</a></p>`,
    ]),
  }
}

export async function priceAlertEmail(
  locale: Locale,
  input: {
    itemName: string
    vehicleName: string
    priceRon: number
    targetPriceRon: number
    vehicleUrl: string
  }
): Promise<EmailContent> {
  const t = await strings(locale)
  // Amounts stay in Romanian formatting in both languages, like every
  // other RON figure in the app.
  return {
    subject: t('priceAlert.subject', { item: input.itemName, vehicle: input.vehicleName }),
    html: layout([
      `<p>${t('priceAlert.body', {
        item: strong(input.itemName),
        price: strong(input.priceRon.toLocaleString('ro-RO')),
        target: esc(input.targetPriceRon.toLocaleString('ro-RO')),
      })}</p>`,
      `<p><a href="${input.vehicleUrl}">${t('priceAlert.cta')}</a></p>`,
    ]),
  }
}

export async function followedProjectUpdateEmail(
  locale: Locale,
  input: { vehicleName: string; message: string; vehicleUrl: string }
): Promise<EmailContent> {
  const t = await strings(locale)
  return {
    subject: t('followedUpdate.subject', { vehicle: input.vehicleName }),
    html: layout([
      `<p>${t('followedUpdate.body', {
        vehicle: strong(input.vehicleName),
        message: esc(input.message),
      })}</p>`,
      `<p><a href="${input.vehicleUrl}">${t('followedUpdate.cta')}</a></p>`,
      `<p style="color:#888;font-size:12px">${t('followedUpdate.footer')}</p>`,
    ]),
  }
}
