import {
  collaboratorInviteEmail,
  collaboratorTaskAddedEmail,
  documentReminderEmail,
  emailLocale,
  followedProjectUpdateEmail,
  inviteeLocale,
  passwordResetEmail,
  paymentFailedEmail,
  priceAlertEmail,
} from '@/lib/email'
import { LOCALES, type Locale } from '@/i18n/config'

/**
 * These build against the real catalogue — the translator behind them
 * needs no request context (src/i18n/translator.ts), which is the whole
 * reason an email can be exercised in a unit test at all.
 */
const BUILDERS: Record<string, (locale: Locale) => Promise<{ subject: string; html: string }>> = {
  passwordReset: (l) => passwordResetEmail(l, 'https://riglog.example/reset-password?token=abc'),
  documentReminder: (l) =>
    documentReminderEmail(l, {
      documentLabel: 'ITP',
      vehicleName: '2001 Jeep Wrangler',
      daysUntilLabel: 'expires in 3 days',
      vehicleUrl: 'https://riglog.example/dashboard/vehicles/v1/documents',
    }),
  collaboratorInvite: (l) =>
    collaboratorInviteEmail(l, {
      inviterName: 'Dan',
      vehicleName: '2001 Jeep Wrangler',
      acceptUrl: 'https://riglog.example/collaborate/accept?token=abc',
    }),
  taskAdded: (l) =>
    collaboratorTaskAddedEmail(l, {
      collaboratorName: 'Ionescu Auto',
      taskName: 'Front brake pads',
      vehicleName: '2001 Jeep Wrangler',
      vehicleUrl: 'https://riglog.example/dashboard/vehicles/v1/tasks/t1',
    }),
  paymentFailed: (l) => paymentFailedEmail(l, 'https://riglog.example/dashboard/settings'),
  priceAlert: (l) =>
    priceAlertEmail(l, {
      itemName: 'Warn winch',
      vehicleName: '2001 Jeep Wrangler',
      priceRon: 1200,
      targetPriceRon: 1500,
      vehicleUrl: 'https://riglog.example/dashboard/vehicles/v1/wishlist',
    }),
  followedUpdate: (l) =>
    followedProjectUpdateEmail(l, {
      vehicleName: '2001 Jeep Wrangler',
      message: 'added new photos',
      vehicleUrl: 'https://riglog.example/builds/dan/wrangler',
    }),
}

const NAMES = Object.keys(BUILDERS)

describe('every email template', () => {
  /**
   * A missing key renders as the dotted key itself and an unsupplied
   * placeholder renders as `{name}` — both of which would go out to a
   * real inbox rather than failing loudly anywhere first.
   */
  it.each(LOCALES.flatMap((locale) => NAMES.map((name) => [locale, name] as const)))(
    'renders in %s with nothing left unresolved: %s',
    async (locale, name) => {
      const { subject, html } = await BUILDERS[name](locale)

      expect(subject.trim()).not.toBe('')
      expect(subject).not.toMatch(/\{\w+\}/)
      expect(html).not.toMatch(/\{\w+\}/)
      // The dotted key would only appear if the catalogue were missing it.
      expect(`${subject} ${html}`).not.toMatch(/\b(passwordReset|documentReminder|collaboratorInvite|taskAdded|paymentFailed|priceAlert|followedUpdate)\.\w+/)
    }
  )

  // Subject and body are built together so they cannot disagree; a
  // Romanian subject over an English body reads as a phishing attempt.
  it.each(NAMES)('says something different in each language: %s', async (name) => {
    const ro = await BUILDERS[name]('ro')
    const en = await BUILDERS[name]('en')
    expect(ro.html).not.toBe(en.html)
  })

  it('keeps the action link intact in both languages', async () => {
    for (const locale of LOCALES) {
      const { html } = await passwordResetEmail(locale, 'https://riglog.example/reset-password?token=abc')
      expect(html).toContain('href="https://riglog.example/reset-password?token=abc"')
    }
  })
})

/**
 * Names, vehicle names and task names are user-typed and end up inside a
 * `<p>` in somebody else's inbox — a collaborator invite carries the
 * inviter's chosen name to a stranger.
 */
describe('user-supplied values in email HTML', () => {
  it('arrive as text, not markup', async () => {
    const { html } = await collaboratorInviteEmail('en', {
      inviterName: '<script>alert(1)</script>',
      vehicleName: '<img src=x onerror=alert(1)>',
      acceptUrl: 'https://riglog.example/collaborate/accept?token=abc',
    })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script')
    expect(html).toContain('&lt;img')
  })

  // The <strong> around a vehicle name is the template's own, added after
  // escaping — so the markup survives while the value cannot inject any.
  it('still get the emphasis the template adds', async () => {
    const { html } = await followedProjectUpdateEmail('en', {
      vehicleName: '2001 Jeep',
      message: 'added new photos',
      vehicleUrl: 'https://riglog.example/builds/dan/wrangler',
    })
    expect(html).toContain('<strong>2001 Jeep</strong>')
  })
})

/**
 * The column is nullable — every account created before the language
 * chooser existed has null — so a reader that trusted it would render
 * raw keys into an inbox.
 */
describe('choosing the recipient’s language', () => {
  it('falls back to the default for a missing or unknown value', () => {
    expect(emailLocale({ locale: 'en' })).toBe('en')
    expect(emailLocale({ locale: null })).toBe('ro')
    expect(emailLocale({ locale: 'klingon' })).toBe('ro')
    expect(emailLocale(null)).toBe('ro')
    expect(emailLocale(undefined)).toBe('ro')
  })

  /**
   * An invitation goes to an address that may have no account at all. The
   * inviter's language is the only signal there is, and a better one than
   * the default: somebody inviting their mechanic knows which language
   * that mechanic reads.
   */
  it('prefers the invitee’s own choice, then the inviter’s', () => {
    expect(inviteeLocale({ locale: 'en' }, { locale: 'ro' })).toBe('en')
    expect(inviteeLocale(null, { locale: 'en' })).toBe('en')
    expect(inviteeLocale({ locale: null }, { locale: 'en' })).toBe('en')
    expect(inviteeLocale(null, null)).toBe('ro')
  })
})
