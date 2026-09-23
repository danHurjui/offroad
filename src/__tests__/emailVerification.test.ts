import fs from 'fs'
import path from 'path'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    emailVerificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}))
jest.mock('@/lib/email', () => ({
  isEmailConfigured: jest.fn(),
  emailLocale: jest.fn().mockReturnValue('ro'),
  sendEmail: jest.fn(),
  verifyEmailEmail: jest.fn().mockResolvedValue({ subject: 's', html: '<p>x</p>' }),
}))
jest.mock('@/lib/appUrl', () => ({ resolveAppUrl: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { isEmailConfigured, sendEmail, verifyEmailEmail } from '@/lib/email'
import { resolveAppUrl } from '@/lib/appUrl'
import {
  consumeVerificationToken,
  isBlockedAsUnverified,
  isEmailVerified,
  isVerificationEnforced,
  sendVerificationEmail,
  verificationDisabledReason,
  verificationUrl,
  VERIFICATION_TOKEN_TTL_MS,
} from '@/lib/emailVerification'

const mockConfigured = isEmailConfigured as jest.Mock
const mockAppUrl = resolveAppUrl as jest.Mock
const mockSend = sendEmail as jest.Mock
const mockTokenFind = prisma.emailVerificationToken.findUnique as jest.Mock
const mockTokenCreate = prisma.emailVerificationToken.create as jest.Mock
const mockUserFind = prisma.user.findUnique as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockConfigured.mockReturnValue(true)
  mockAppUrl.mockReturnValue('https://riglog.ro')
  mockSend.mockResolvedValue(undefined)
  mockTokenCreate.mockImplementation(({ data }: { data: { token: string } }) =>
    Promise.resolve({ id: 't1', token: data.token })
  )
  mockTransaction.mockResolvedValue([])
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('whether an address counts as confirmed', () => {
  it('is the timestamp and nothing else', () => {
    expect(isEmailVerified({ emailVerifiedAt: new Date() })).toBe(true)
    expect(isEmailVerified({ emailVerifiedAt: null })).toBe(false)
    expect(isEmailVerified({})).toBe(false)
    // A user row that could not be read is not a confirmed one.
    expect(isEmailVerified(null)).toBe(false)
    expect(isEmailVerified(undefined)).toBe(false)
  })

  /**
   * Deliberately independent of whether the rule is being enforced. The
   * settings page reports this, and a card that said "confirmed" because
   * the operator forgot a mail key would be stating something false about
   * the person's account.
   */
  it('does not soften when the rule is switched off', () => {
    mockConfigured.mockReturnValue(false)
    expect(isEmailVerified({ emailVerifiedAt: null })).toBe(false)
  })
})

describe('whether the rule can fairly be applied', () => {
  it('is on when a provider and a public address are both configured', () => {
    expect(verificationDisabledReason()).toBeNull()
    expect(isVerificationEnforced()).toBe(true)
  })

  /**
   * Fails open. Enforcing with no mail provider would wall every new
   * account behind a link that cannot be sent — an unfixable refusal
   * produced by a missing environment variable.
   */
  it('is off, naming the reason, with no mail provider', () => {
    mockConfigured.mockReturnValue(false)
    expect(verificationDisabledReason()).toBe('noEmailProvider')
    expect(isVerificationEnforced()).toBe(false)
  })

  /** A link with nowhere to point is the same problem wearing a hat. */
  it('is off, naming the reason, with no usable public address', () => {
    mockAppUrl.mockReturnValue(null)
    expect(verificationDisabledReason()).toBe('noAppUrl')
    expect(isVerificationEnforced()).toBe(false)
  })
})

describe('who gets blocked', () => {
  it('blocks an unconfirmed account only while the rule is on', () => {
    expect(isBlockedAsUnverified({ emailVerifiedAt: null })).toBe(true)
    mockConfigured.mockReturnValue(false)
    expect(isBlockedAsUnverified({ emailVerifiedAt: null })).toBe(false)
  })

  it('never blocks a confirmed account', () => {
    expect(isBlockedAsUnverified({ emailVerifiedAt: new Date() })).toBe(false)
    mockConfigured.mockReturnValue(false)
    expect(isBlockedAsUnverified({ emailVerifiedAt: new Date() })).toBe(false)
  })
})

describe('sending the link', () => {
  it('reports honestly that nothing was sent with no provider configured', async () => {
    mockConfigured.mockReturnValue(false)
    const result = await sendVerificationEmail({ id: 'u1', email: 'a@b.ro' })
    expect(result).toEqual({ sent: false, reason: 'notConfigured' })
    expect(mockSend).not.toHaveBeenCalled()
    // And no token was minted, so nothing live is left behind for a
    // message that was never written.
    expect(mockTokenCreate).not.toHaveBeenCalled()
  })

  it('reports honestly that nothing was sent with no public address', async () => {
    mockAppUrl.mockReturnValue(null)
    const result = await sendVerificationEmail({ id: 'u1', email: 'a@b.ro' })
    expect(result).toEqual({ sent: false, reason: 'notConfigured' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  /**
   * Never throws. Registration calls this after the account exists, and a
   * provider rejection must not be able to unwind a signup somebody has
   * just completed — the link can be resent.
   */
  it('reports a provider rejection rather than throwing it at the caller', async () => {
    mockSend.mockRejectedValue(new Error('brevo said no'))
    await expect(sendVerificationEmail({ id: 'u1', email: 'a@b.ro' })).resolves.toEqual({
      sent: false,
      reason: 'sendFailed',
    })
    // And the token goes with it: nobody received that link, so leaving
    // it live would be a credential issued to no one. Same rule the
    // password-reset route follows.
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } })
  })

  it('mails the account a link carrying the token it just minted', async () => {
    let issued = ''
    mockTokenCreate.mockImplementation(({ data }: { data: { token: string } }) => {
      issued = data.token
      return Promise.resolve({ id: 't1', token: data.token })
    })

    const result = await sendVerificationEmail({ id: 'u1', email: 'a@b.ro' })
    expect(result).toEqual({ sent: true })

    expect(issued).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyEmailEmail).toHaveBeenCalledWith('ro', `https://riglog.ro/verify-email?token=${issued}`)
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.ro' }))
  })

  it('gives the token a full day, where a password reset gets an hour', () => {
    expect(VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('builds the link against the configured origin', () => {
    expect(verificationUrl('https://riglog.ro', 'abc')).toBe(
      'https://riglog.ro/verify-email?token=abc'
    )
  })
})

describe('spending the link', () => {
  it('refuses a token that does not exist', async () => {
    mockTokenFind.mockResolvedValue(null)
    expect(await consumeVerificationToken('nope')).toEqual({ ok: false, reason: 'invalid' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('refuses a token whose time is up', async () => {
    mockTokenFind.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      used: false,
      expiresAt: new Date(Date.now() - 1000),
    })
    expect(await consumeVerificationToken('old')).toEqual({ ok: false, reason: 'expired' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('confirms the address and spends every outstanding token at once', async () => {
    mockTokenFind.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      used: false,
      expiresAt: new Date(Date.now() + 1000),
    })
    expect(await consumeVerificationToken('good')).toEqual({ ok: true, alreadyVerified: false })

    // One transaction, because a failure between the two writes would
    // leave somebody who clicked a now-dead link still unconfirmed.
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } })
    )
    expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', used: false },
      data: { used: true },
    })
  })

  /**
   * Mail clients prefetch links and people press back. A second click on
   * a link that did its job is not a failure, and reporting one would be
   * a false alarm about something that worked.
   */
  it('answers success to a spent token on an account that is confirmed', async () => {
    mockTokenFind.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      used: true,
      expiresAt: new Date(Date.now() + 1000),
    })
    mockUserFind.mockResolvedValue({ emailVerifiedAt: new Date() })
    expect(await consumeVerificationToken('again')).toEqual({ ok: true, alreadyVerified: true })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  /** A spent token on an unconfirmed account really is a dead end. */
  it('answers expired to a spent token on an account that is not confirmed', async () => {
    mockTokenFind.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      used: true,
      expiresAt: new Date(Date.now() + 1000),
    })
    mockUserFind.mockResolvedValue({ emailVerifiedAt: null })
    expect(await consumeVerificationToken('again')).toEqual({ ok: false, reason: 'expired' })
  })
})

/**
 * The rule is only worth having where it is actually applied, and the
 * list of places is a decision rather than an implementation detail: the
 * writes that reach other people. Asserted against the source so that a
 * new handler pasted from an old one cannot quietly drop the gate.
 */
describe('the gate is on every write that reaches other people', () => {
  const gated = [
    'src/app/api/tickets/route.ts',
    'src/app/api/tickets/[id]/comments/route.ts',
    'src/app/api/tickets/[id]/vote/route.ts',
    'src/app/api/parts-requests/route.ts',
    'src/app/api/parts-requests/[id]/comments/route.ts',
    'src/app/api/vehicles/[id]/collaborators/route.ts',
    'src/app/api/organizations/[orgId]/invites/route.ts',
    'src/app/api/organizations/[orgId]/invites/[inviteId]/resend/route.ts',
  ]

  it.each(gated)('%s asks for a confirmed address', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    expect(source).toContain('requireVerifiedSession')
  })

  /**
   * Publishing is a field on a route whose other fields edit a private
   * record, so it is checked at the field rather than at the door —
   * refusing somebody the ability to correct their own mileage over an
   * unclicked link would be punishing them for nothing.
   */
  it('checks publishing a vehicle at the field, not the whole route', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/vehicles/[id]/route.ts'),
      'utf8'
    )
    expect(source).toContain('isBlockedAsUnverified')
    expect(source).not.toContain('requireVerifiedSession')
  })

  /**
   * The private garage stays open. Logging work on your own vehicle is
   * not something a confirmation link should hold hostage, and a gate
   * that crept onto it would be a different product decision made by
   * accident.
   */
  it.each([
    'src/app/api/vehicles/route.ts',
    'src/app/api/vehicles/[id]/tasks/route.ts',
    'src/app/api/vehicles/[id]/photos/route.ts',
    'src/app/api/vehicles/[id]/documents/route.ts',
  ])('%s stays open to an unconfirmed account', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    expect(source).not.toContain('requireVerifiedSession')
  })
})
