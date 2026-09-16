jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }))
jest.mock('@/lib/personalData', () => ({ collectUserData: jest.fn() }))
jest.mock('@/lib/rateLimit', () => {
  const actual = jest.requireActual('@/lib/rateLimit')
  return { ...actual, consumeRateLimit: jest.fn() }
})

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { collectUserData } from '@/lib/personalData'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { GET } from '@/app/api/me/export/route'

const mockGetSession = getServerSession as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockCollect = collectUserData as jest.Mock
const mockConsume = consumeRateLimit as jest.Mock

const SESSION = { user: { id: 'u1', email: 'dan@example.com' } }

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(SESSION)
  // requireSession revalidates that the account is still active.
  mockUserFindUnique.mockResolvedValue({ active: true, isAdmin: false })
  mockConsume.mockResolvedValue({ ok: true, remaining: 9, retryAfterSeconds: 0 })
  mockCollect.mockResolvedValue({ account: { id: 'u1' }, vehicles: [] })
})

describe('GET /api/me/export', () => {
  it('rejects an anonymous request', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockCollect).not.toHaveBeenCalled()
  })

  it('exports only the session user’s data', async () => {
    await GET()
    expect(mockCollect).toHaveBeenCalledWith('u1')
  })

  it('returns the export as JSON', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(await res.json()).toEqual({ account: { id: 'u1' }, vehicles: [] })
  })

  it('offers it as a download rather than rendering it', async () => {
    const res = await GET()
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toMatch(/^attachment/)
    expect(disposition).toMatch(/riglog-data-\d{4}-\d{2}-\d{2}\.json/)
  })

  // It is a complete copy of one person's data; a shared cache holding it
  // is the kind of mistake that shows up in someone else's browser.
  it('forbids caching', async () => {
    const res = await GET()
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
    expect(res.headers.get('cache-control')).toMatch(/private/)
  })

  // Keyed on the user id, not the IP: an IP header can be rotated at will
  // (pitfall #13), and an export is inherently per-account anyway.
  it('throttles per account, not per address', async () => {
    await GET()
    expect(mockConsume).toHaveBeenCalledWith('dataExport', 'user:u1')
  })

  it('returns 429 when throttled, without building the export', async () => {
    mockConsume.mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 600 })
    const res = await GET()
    expect(res.status).toBe(429)
    expect(mockCollect).not.toHaveBeenCalled()
  })

  it('does not leak internals when the export fails', async () => {
    mockCollect.mockRejectedValue(new Error('column "x" does not exist'))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})

/**
 * Exporting your own data is a legal right, so the budget has to be
 * generous enough that nobody acting in good faith is ever refused.
 */
describe('the dataExport limit is not an obstacle', () => {
  it('allows several exports an hour', () => {
    expect(RATE_LIMITS.dataExport.limit).toBeGreaterThanOrEqual(5)
    expect(RATE_LIMITS.dataExport.windowSeconds).toBeLessThanOrEqual(60 * 60)
  })
})
