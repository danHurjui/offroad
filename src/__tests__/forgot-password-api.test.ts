jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    passwordResetToken: { create: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
  isEmailConfigured: jest.fn(),
  passwordResetEmailHtml: jest.fn().mockReturnValue('<p>reset</p>'),
}))
jest.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: jest.fn().mockResolvedValue({ ok: true, remaining: 5, retryAfterSeconds: 0 }),
  rateLimitResponse: jest.requireActual('@/lib/rateLimit').rateLimitResponse,
  clientIp: jest.fn().mockReturnValue('1.2.3.4'),
}))

import { prisma } from '@/lib/prisma'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { consumeRateLimit } from '@/lib/rateLimit'
import { POST } from '@/app/api/auth/forgot-password/route'

const mockFindUnique = prisma.user.findUnique as jest.Mock
const mockTokenCreate = prisma.passwordResetToken.create as jest.Mock
const mockTokenDelete = prisma.passwordResetToken.delete as jest.Mock
const mockSendEmail = sendEmail as jest.Mock
const mockIsConfigured = isEmailConfigured as jest.Mock
const mockConsume = consumeRateLimit as jest.Mock

function req(body: unknown) {
  return { headers: new Headers(), json: () => Promise.resolve(body) } as never
}

const USER = { id: 'u1', email: 'dan@example.com', active: true }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockIsConfigured.mockReturnValue(true)
  mockConsume.mockResolvedValue({ ok: true, remaining: 5, retryAfterSeconds: 0 })
  mockFindUnique.mockResolvedValue(USER)
  mockTokenCreate.mockResolvedValue({ id: 'tok1', token: 'abc' })
  mockSendEmail.mockResolvedValue(undefined)
  mockTokenDelete.mockResolvedValue({})
})

describe('POST /api/auth/forgot-password — happy path', () => {
  it('creates a token and sends the email', async () => {
    const res = await POST(req({ email: 'dan@example.com' }))
    expect(res.status).toBe(200)
    expect(mockTokenCreate).toHaveBeenCalled()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'dan@example.com', subject: 'Reset your RigLog password' })
    )
  })

  it('puts a usable reset link in the email', async () => {
    process.env.NEXTAUTH_URL = 'https://riglog.example'
    mockTokenCreate.mockImplementation(({ data }: { data: { token: string } }) =>
      Promise.resolve({ id: 'tok1', token: data.token })
    )
    await POST(req({ email: 'dan@example.com' }))
    const { passwordResetEmailHtml } = jest.requireMock('@/lib/email')
    const url = passwordResetEmailHtml.mock.calls[0][0]
    expect(url).toMatch(/^https:\/\/riglog\.example\/reset-password\?token=[a-f0-9]{64}$/)
  })

  it('normalises the address before looking it up', async () => {
    await POST(req({ email: '  DAN@Example.COM ' }))
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'dan@example.com' } })
  })

  it('stays silent about unknown addresses', async () => {
    mockFindUnique.mockResolvedValue(null)
    const res = await POST(req({ email: 'nobody@example.com' }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('does not send to a deactivated account', async () => {
    mockFindUnique.mockResolvedValue({ ...USER, active: false })
    expect((await POST(req({ email: 'dan@example.com' }))).status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('when email is not configured', () => {
  // The reported bug: with no provider the route used to return its
  // reassuring "check your inbox" message and send nothing.
  it('refuses with 503 instead of claiming a link was sent', async () => {
    mockIsConfigured.mockReturnValue(false)
    const res = await POST(req({ email: 'dan@example.com' }))
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' })
  })

  it('creates no token it cannot deliver', async () => {
    mockIsConfigured.mockReturnValue(false)
    await POST(req({ email: 'dan@example.com' }))
    expect(mockTokenCreate).not.toHaveBeenCalled()
  })

  // Checked before the user lookup, so the answer can't vary by whether
  // the address exists.
  it('answers identically for a known and an unknown address', async () => {
    mockIsConfigured.mockReturnValue(false)
    const known = await POST(req({ email: 'dan@example.com' }))
    mockFindUnique.mockResolvedValue(null)
    const unknown = await POST(req({ email: 'nobody@example.com' }))
    expect(known.status).toBe(unknown.status)
    expect(await known.text()).toBe(await unknown.text())
  })
})

describe('when the provider rejects the message', () => {
  beforeEach(() => mockSendEmail.mockRejectedValue(new Error('Resend send failed: 403 domain not verified')))

  it('reports the failure rather than a false success', async () => {
    const res = await POST(req({ email: 'dan@example.com' }))
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: 'EMAIL_SEND_FAILED' })
  })

  // A token nobody received is a live credential sitting in the database.
  it('deletes the undelivered token', async () => {
    await POST(req({ email: 'dan@example.com' }))
    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { id: 'tok1' } })
  })

  it('still responds if the cleanup itself fails', async () => {
    mockTokenDelete.mockRejectedValue(new Error('db gone'))
    expect((await POST(req({ email: 'dan@example.com' }))).status).toBe(502)
  })
})

describe('validation and throttling', () => {
  it('400s an empty address', async () => {
    expect((await POST(req({ email: '   ' }))).status).toBe(400)
  })

  it('429s once the per-address limit is hit', async () => {
    mockConsume.mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 900 })
    const res = await POST(req({ email: 'dan@example.com' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('900')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
