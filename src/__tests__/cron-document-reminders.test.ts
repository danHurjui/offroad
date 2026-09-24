jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: { findMany: jest.fn(), update: jest.fn() },
    vehicle: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    pushSubscription: { delete: jest.fn().mockResolvedValue({}) },
  },
}))
jest.mock('@/lib/webpush', () => ({ sendPushNotification: jest.fn().mockResolvedValue('sent') }))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  documentReminderEmail: jest.fn().mockResolvedValue({ subject: 's', html: '<p>x</p>' }),
  batteryWarrantyReminderEmail: jest.fn().mockResolvedValue({ subject: 'w', html: '<p>w</p>' }),
  emailLocale: jest.fn().mockReturnValue('ro'),
}))
// The email/notification path builds its translator directly from the
// catalogue (src/i18n/translator.ts), so there is no request context to
// stub — only a locale to pass.
jest.mock('@/i18n/translator', () => ({
  translator: jest.fn(async (locale: string) => (key: string) => `${locale}:${key}`),
}))

import { prisma } from '@/lib/prisma'
import { sendEmail, emailLocale } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'
import { GET, POST } from '@/app/api/cron/document-reminders/route'

const mockFindMany = prisma.document.findMany as jest.Mock
const mockUpdate = prisma.document.update as jest.Mock
const mockSendEmail = sendEmail as jest.Mock
const mockPush = sendPushNotification as jest.Mock

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (key: string) => headers[key] ?? null } } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([])
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
      vehicle: { id: 'v1', make: 'Jeep', model: 'TJ', year: 2000, owner: { email: 'owner@test.com', pushSubscriptions: [] } },
    },
  ])
  const res = await POST(req({ 'x-cron-secret': 'test-secret' }))
  const data = await res.json()
  expect(res.status).toBe(200)
  expect(data).toMatchObject({ checked: 1, sent: 1 })
  expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { reminder30SentAt: expect.any(Date) } })
  expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@test.com' }))
})

/**
 * RL-038: a company vehicle's ownerId is only its account of record, who
 * may have left. Its reminders go to the organisation's owners and fleet
 * managers — the query selects only those roles.
 */
it('sends a company vehicle’s reminder to the people who manage it, not its account of record', async () => {
  const expiryDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)
  mockFindMany.mockResolvedValue([
    {
      id: 'd1', type: 'ITP', expiryDate,
      reminder30SentAt: null, reminder14SentAt: null, reminder3SentAt: null,
      vehicle: {
        id: 'v1', make: 'Dacia', model: 'Logan', year: 2020,
        organizationId: 'o1',
        owner: { email: 'left-the-company@test.com', pushSubscriptions: [] },
        organization: { members: [{ user: { email: 'boss@firma.ro', pushSubscriptions: [] } }, { user: { email: 'fleet@firma.ro', pushSubscriptions: [] } }] },
      },
    },
  ])
  const data = await (await POST(req({ 'x-cron-secret': 'test-secret' }))).json()
  expect(data).toMatchObject({ checked: 1, sent: 2 })
  const to = mockSendEmail.mock.calls.map((c) => c[0].to)
  expect(to).toEqual(['boss@firma.ro', 'fleet@firma.ro'])
  const select = mockFindMany.mock.calls[0][0].include.vehicle.select
  expect(select.organization.select.members.where).toEqual({ role: { in: ['OWNER', 'FLEET_MANAGER'] } })
})

it('one manager’s failed send does not cost the next one theirs', async () => {
  const expiryDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)
  mockFindMany.mockResolvedValue([
    {
      id: 'd1', type: 'ITP', expiryDate,
      reminder30SentAt: null, reminder14SentAt: null, reminder3SentAt: null,
      vehicle: {
        id: 'v1', make: 'Dacia', model: 'Logan', year: 2020, organizationId: 'o1',
        owner: { email: 'x@test.com', pushSubscriptions: [] },
        organization: { members: [{ user: { email: 'bounces@firma.ro', pushSubscriptions: [] } }, { user: { email: 'fleet@firma.ro', pushSubscriptions: [] } }] },
      },
    },
  ])
  mockSendEmail.mockRejectedValueOnce(new Error('rejected'))
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const res = await POST(req({ 'x-cron-secret': 'test-secret' }))
  expect(res.status).toBe(200)
  expect((await res.json()).sent).toBe(1)
  expect(mockSendEmail.mock.calls.map((c) => c[0].to)).toEqual(['bounces@firma.ro', 'fleet@firma.ro'])
})

it('skips a document with no threshold reached', async () => {
  const expiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  mockFindMany.mockResolvedValue([
    {
      id: 'd1', type: 'RCA', expiryDate,
      reminder30SentAt: null, reminder14SentAt: null, reminder3SentAt: null,
      vehicle: { id: 'v1', make: 'Jeep', model: 'TJ', year: 2000, owner: { email: 'owner@test.com', pushSubscriptions: [] } },
    },
  ])
  const res = await POST(req({ 'x-cron-secret': 'test-secret' }))
  const data = await res.json()
  expect(data).toMatchObject({ checked: 1, sent: 0 })
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(mockSendEmail).not.toHaveBeenCalled()
})

describe('Web Push (#100)', () => {
  const soon = () => new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)
  const sub = (id: string) => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a' })
  const doc = (vehicle: Record<string, unknown>, sent: Partial<Record<string, Date>> = {}) => ({
    id: 'd1', type: 'ITP', expiryDate: soon(),
    reminder30SentAt: null, reminder14SentAt: null, reminder3SentAt: null, ...sent,
    vehicle: { id: 'v1', make: 'Dacia', model: 'Logan', year: 2020, organizationId: null, organization: null, ...vehicle },
  })

  it('pushes to every device of every recipient, in the recipient’s language', async () => {
    ;(emailLocale as jest.Mock).mockImplementation((u: { locale?: string }) => u.locale ?? 'ro')
    mockFindMany.mockResolvedValue([
      doc({
        organizationId: 'o1',
        owner: { email: 'x@test.com', pushSubscriptions: [] },
        organization: {
          members: [
            { user: { email: 'boss@firma.ro', locale: 'ro', pushSubscriptions: [sub('phone'), sub('laptop')] } },
            { user: { email: 'fleet@firma.ro', locale: 'en', pushSubscriptions: [sub('tablet')] } },
          ],
        },
      }),
    ])
    const data = await (await POST(req({ 'x-cron-secret': 'test-secret' }))).json()
    expect(data).toMatchObject({ sent: 2, pushed: 3 })
    expect(mockPush.mock.calls.map((c) => [c[0].id, c[1].title])).toEqual([
      ['phone', 'ro:documentReminderTitle'],
      ['laptop', 'ro:documentReminderTitle'],
      ['tablet', 'en:documentReminderTitle'],
    ])
    expect(mockPush.mock.calls[0][1].url).toMatch(/\/dashboard\/vehicles\/v1\/documents$/)
    const select = mockFindMany.mock.calls[0][0].include.vehicle.select
    expect(select.owner.select.pushSubscriptions).toBeTruthy()
    ;(emailLocale as jest.Mock).mockReturnValue('ro')
  })

  it('sends nothing, push included, for a threshold already sent', async () => {
    const now = new Date()
    mockFindMany.mockResolvedValue([
      doc({ owner: { email: 'o@test.com', pushSubscriptions: [sub('phone')] } }, { reminder30SentAt: now }),
    ])
    await POST(req({ 'x-cron-secret': 'test-secret' }))
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('pushes once per threshold, not once per push', async () => {
    mockFindMany.mockResolvedValue([doc({ owner: { email: 'o@test.com', pushSubscriptions: [sub('phone')] } })])
    await POST(req({ 'x-cron-secret': 'test-secret' }))
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
  })

  it('deletes a dead subscription and still reaches the next device', async () => {
    mockPush.mockResolvedValueOnce('gone')
    mockFindMany.mockResolvedValue([doc({ owner: { email: 'o@test.com', pushSubscriptions: [sub('old'), sub('new')] } })])
    const data = await (await POST(req({ 'x-cron-secret': 'test-secret' }))).json()
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'old' } })
    expect(mockPush).toHaveBeenCalledTimes(2)
    expect(data.pushed).toBe(1)
  })

  it('a failing push costs neither the email nor the next recipient', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockPush.mockRejectedValueOnce(new Error('push service down'))
    mockFindMany.mockResolvedValue([
      doc({
        organizationId: 'o1',
        owner: { email: 'x@test.com', pushSubscriptions: [] },
        organization: {
          members: [
            { user: { email: 'a@firma.ro', pushSubscriptions: [sub('a')] } },
            { user: { email: 'b@firma.ro', pushSubscriptions: [sub('b')] } },
          ],
        },
      }),
    ])
    const res = await POST(req({ 'x-cron-secret': 'test-secret' }))
    expect(res.status).toBe(200)
    expect(mockSendEmail.mock.calls.map((c) => c[0].to)).toEqual(['a@firma.ro', 'b@firma.ro'])
    expect(mockPush.mock.calls.map((c) => c[0].id)).toEqual(['a', 'b'])
  })

  it('a failing email does not cost the push', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockSendEmail.mockRejectedValueOnce(new Error('rejected'))
    mockFindMany.mockResolvedValue([doc({ owner: { email: 'o@test.com', pushSubscriptions: [sub('phone')] } })])
    await POST(req({ 'x-cron-secret': 'test-secret' }))
    expect(mockPush).toHaveBeenCalledTimes(1)
  })
})

// RL-056: the battery warranty reminder rides the same daily job.
describe('battery warranty reminder', () => {
  const DAY = 24 * 60 * 60 * 1000
  const ev = (over: Record<string, unknown> = {}) => ({
    id: 'v9', make: 'Dacia', model: 'Spring', year: 2022, fuelType: 'ELECTRIC',
    batteryWarrantyUntil: new Date(Date.now() + 40 * DAY), batteryWarrantyKm: null,
    odometerReadings: [],
    organizationId: null, owner: { email: 'ev@test.com', pushSubscriptions: [] }, organization: null,
    ...over,
  })
  const run = async () => (await POST(req({ 'x-cron-secret': 'test-secret' }))).json()

  beforeEach(() => {
    mockFindMany.mockResolvedValue([])
    process.env.NEXTAUTH_URL = 'https://riglog.example'
  })
  afterEach(() => delete process.env.NEXTAUTH_URL)

  it('asks only for vehicles with terms and no reminder yet', async () => {
    await run()
    expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      batteryWarrantyRemindedAt: null,
      OR: [{ batteryWarrantyUntil: { not: null } }, { batteryWarrantyKm: { not: null } }],
    })
  })

  it('reminds once inside 90 days, marking it before it sends', async () => {
    ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([ev()])
    const data = await run()
    expect(prisma.vehicle.update).toHaveBeenCalledWith({ where: { id: 'v9' }, data: { batteryWarrantyRemindedAt: expect.any(Date) } })
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ev@test.com', subject: 'w' }))
    expect(data.sent).toBe(1)
  })

  it('reminds inside 5,000 km of a km limit, from the newest reading', async () => {
    ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([
      ev({ batteryWarrantyUntil: null, batteryWarrantyKm: 160_000, odometerReadings: [{ km: 157_000, readAt: new Date(), isOverride: false, createdAt: new Date() }] }),
    ])
    await run()
    expect(prisma.vehicle.update).toHaveBeenCalled()
  })

  it.each([
    ['far off', { batteryWarrantyUntil: new Date(Date.now() + 400 * DAY) }],
    ['already ended', { batteryWarrantyUntil: new Date(Date.now() - 2 * DAY) }],
    ['a km limit with no km to measure', { batteryWarrantyUntil: null, batteryWarrantyKm: 160_000 }],
    ['a car that does not plug in', { fuelType: 'DIESEL' }],
  ])('sends nothing for %s', async (_name, over) => {
    ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([ev(over)])
    await run()
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('a company vehicle’s reminder goes to the people who manage it', async () => {
    ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([
      ev({ organizationId: 'o1', organization: { members: [{ user: { email: 'm1@co.ro', pushSubscriptions: [] } }, { user: { email: 'm2@co.ro', pushSubscriptions: [] } }] } }),
    ])
    await run()
    expect(mockSendEmail.mock.calls.map((c) => c[0].to)).toEqual(['m1@co.ro', 'm2@co.ro'])
  })
})
