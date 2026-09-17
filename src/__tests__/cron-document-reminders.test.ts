jest.mock('@/lib/prisma', () => ({
  prisma: { document: { findMany: jest.fn(), update: jest.fn() } },
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  documentReminderEmail: jest.fn().mockResolvedValue({ subject: 's', html: '<p>x</p>' }),
  emailLocale: jest.fn().mockReturnValue('ro'),
}))
// The email/notification path builds its translator directly from the
// catalogue (src/i18n/translator.ts), so there is no request context to
// stub — only a locale to pass.
jest.mock('@/i18n/translator', () => ({
  translator: jest.fn().mockResolvedValue((key: string) => `t:${key}`),
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { GET, POST } from '@/app/api/cron/document-reminders/route'

const mockFindMany = prisma.document.findMany as jest.Mock
const mockUpdate = prisma.document.update as jest.Mock
const mockSendEmail = sendEmail as jest.Mock

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (key: string) => headers[key] ?? null } } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
})

it('returns 401 without the correct x-cron-secret header', async () => {
  const res = await POST(req())
  expect(res.status).toBe(401)
  expect(mockFindMany).not.toHaveBeenCalled()
})

it('returns 401 if CRON_SECRET is unset (fails closed, never treats "no secret configured" as public)', async () => {
  delete process.env.CRON_SECRET
  const res = await POST(req({ 'x-cron-secret': 'anything' }))
  expect(res.status).toBe(401)
})

it('accepts the Authorization: Bearer header Vercel Cron sends automatically', async () => {
  mockFindMany.mockResolvedValue([])
  const res = await GET(req({ authorization: 'Bearer test-secret' }))
  expect(res.status).toBe(200)
})

it('rejects a Bearer token that does not match CRON_SECRET', async () => {
  const res = await GET(req({ authorization: 'Bearer wrong-secret' }))
  expect(res.status).toBe(401)
})

it('GET and POST both work — Vercel invokes cron routes with GET', async () => {
  mockFindMany.mockResolvedValue([])
  const getRes = await GET(req({ 'x-cron-secret': 'test-secret' }))
  const postRes = await POST(req({ 'x-cron-secret': 'test-secret' }))
  expect(getRes.status).toBe(200)
  expect(postRes.status).toBe(200)
})

it('sends a reminder for a document crossing a threshold and marks it sent', async () => {
  const expiryDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000) // ~25 days out -> crosses 30
  mockFindMany.mockResolvedValue([
    {
      id: 'd1', type: 'ITP', expiryDate,
      reminder30SentAt: null, reminder14SentAt: null, reminder3SentAt: null,
      vehicle: { id: 'v1', make: 'Jeep', model: 'TJ', year: 2000, owner: { email: 'owner@test.com' } },
    },
  ])
  const res = await POST(req({ 'x-cron-secret': 'test-secret' }))
  const data = await res.json()
  expect(res.status).toBe(200)
  expect(data).toMatchObject({ checked: 1, sent: 1 })
  expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { reminder30SentAt: expect.any(Date) } })
  expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@test.com' }))
})

it('skips a document with no threshold reached', async () => {
  const expiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  mockFindMany.mockResolvedValue([
    {
      id: 'd1', type: 'RCA', expiryDate,
      reminder30SentAt: null, reminder14SentAt: null, reminder3SentAt: null,
      vehicle: { id: 'v1', make: 'Jeep', model: 'TJ', year: 2000, owner: { email: 'owner@test.com' } },
    },
  ])
  const res = await POST(req({ 'x-cron-secret': 'test-secret' }))
  const data = await res.json()
  expect(data).toMatchObject({ checked: 1, sent: 0 })
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(mockSendEmail).not.toHaveBeenCalled()
})
