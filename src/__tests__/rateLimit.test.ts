jest.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: jest.fn(), rateLimit: { deleteMany: jest.fn() } },
}))

import { prisma } from '@/lib/prisma'
import {
  consumeRateLimit,
  clientIp,
  rateLimitResponse,
  purgeExpiredRateLimits,
  RATE_LIMITS,
} from '@/lib/rateLimit'

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock
const mockDeleteMany = prisma.rateLimit.deleteMany as jest.Mock

/** The route returns the post-increment count, as the real SQL does. */
function counterAt(count: number, secondsLeft = 60) {
  return [{ count, expiresAt: new Date(Date.now() + secondsLeft * 1000) }]
}

beforeEach(() => jest.clearAllMocks())

describe('consumeRateLimit', () => {
  it('allows a request inside the limit and reports what is left', async () => {
    mockQueryRaw.mockResolvedValue(counterAt(1))
    const r = await consumeRateLimit('login', 'ip:1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.remaining).toBe(RATE_LIMITS.login.limit - 1)
  })

  it('allows the request that exactly reaches the limit', async () => {
    mockQueryRaw.mockResolvedValue(counterAt(RATE_LIMITS.login.limit))
    const r = await consumeRateLimit('login', 'ip:1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.remaining).toBe(0)
  })

  it('blocks the first request past the limit', async () => {
    mockQueryRaw.mockResolvedValue(counterAt(RATE_LIMITS.login.limit + 1))
    const r = await consumeRateLimit('login', 'ip:1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('honours a custom rule over the configured default', async () => {
    mockQueryRaw.mockResolvedValue(counterAt(3))
    const blocked = await consumeRateLimit('login', 'x', { limit: 2, windowSeconds: 10 })
    expect(blocked.ok).toBe(false)
  })

  it('namespaces the key by action so limits do not share a bucket', async () => {
    mockQueryRaw.mockResolvedValue(counterAt(1))
    await consumeRateLimit('login', 'user:abc')
    await consumeRateLimit('ticketCreate', 'user:abc')
    const keys = mockQueryRaw.mock.calls.map((c) => c[1])
    expect(keys[0]).toBe('login:user:abc')
    expect(keys[1]).toBe('ticketCreate:user:abc')
    expect(keys[0]).not.toBe(keys[1])
  })

  it('rounds retry-after up to at least one second', async () => {
    mockQueryRaw.mockResolvedValue([
      { count: RATE_LIMITS.login.limit + 1, expiresAt: new Date(Date.now() + 10) },
    ])
    const r = await consumeRateLimit('login', 'x')
    expect(r.retryAfterSeconds).toBe(1)
  })

  // A limiter outage must not take down login. The tradeoff is documented
  // in the module: an attacker who can break the DB gets unlimited tries,
  // but they have bigger problems to exploit at that point.
  it('fails open when the database is unreachable', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connection refused'))
    const r = await consumeRateLimit('login', 'ip:1.2.3.4')
    expect(r.ok).toBe(true)
  })

  it('fails open if the statement returns no row', async () => {
    mockQueryRaw.mockResolvedValue([])
    expect((await consumeRateLimit('login', 'x')).ok).toBe(true)
  })

  it('uses a single atomic statement, never read-then-write', async () => {
    mockQueryRaw.mockResolvedValue(counterAt(1))
    await consumeRateLimit('login', 'x')
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    const sql = mockQueryRaw.mock.calls[0][0].join('?')
    expect(sql).toMatch(/INSERT INTO "RateLimit"/)
    expect(sql).toMatch(/ON CONFLICT/)
    expect(sql).toMatch(/RETURNING/)
  })
})

describe('configured limits are sane', () => {
  it.each(Object.entries(RATE_LIMITS))('%s has a positive limit and window', (_name, rule) => {
    expect(rule.limit).toBeGreaterThan(0)
    expect(rule.windowSeconds).toBeGreaterThan(0)
  })

  // The design rule that matters: an IP-keyed limit is shared by everyone
  // behind a NAT or carrier gateway, so it must be looser than the
  // account-keyed limit covering the same action, or real users get locked
  // out by a stranger on the same address.
  it('keeps each IP-keyed limit looser than its account-keyed counterpart', () => {
    expect(RATE_LIMITS.loginIp.limit).toBeGreaterThan(RATE_LIMITS.login.limit)
    expect(RATE_LIMITS.forgotPasswordIp.limit).toBeGreaterThan(RATE_LIMITS.forgotPassword.limit)
  })

  it('keeps the per-account login limit tight enough to matter', () => {
    // Tight per account is safe — it only ever affects the account under
    // attack — and is the real defence against targeted brute force.
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10)
  })

  it('limits the reset-email flood vector hardest', () => {
    // Sending mail to someone else's inbox is the one action where the
    // victim is a third party, so it gets the tightest budget of all.
    const perAccount = [RATE_LIMITS.forgotPassword, RATE_LIMITS.login].map((r) => r.limit)
    expect(RATE_LIMITS.forgotPassword.limit).toBe(Math.min(...perAccount))
  })
})

describe('clientIp', () => {
  it('takes the leftmost x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' })
    expect(clientIp(h)).toBe('203.0.113.9')
  })

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('returns a stable placeholder when no header is present', () => {
    expect(clientIp(new Headers())).toBe('unknown')
  })

  // The limiter must never be the reason a request 500s.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a non-Headers object', {} as unknown as Headers],
  ])('tolerates %s instead of throwing', (_label, value) => {
    expect(clientIp(value as Headers)).toBe('unknown')
  })
})

describe('rateLimitResponse', () => {
  it('is a 429 carrying Retry-After', async () => {
    const res = await rateLimitResponse({ ok: false, remaining: 0, retryAfterSeconds: 42 })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    await expect(res.json()).resolves.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 42 })
  })
})

describe('purgeExpiredRateLimits', () => {
  it('deletes only elapsed windows', async () => {
    mockDeleteMany.mockResolvedValue({ count: 7 })
    expect(await purgeExpiredRateLimits()).toBe(7)
    expect(mockDeleteMany.mock.calls[0][0].where.expiresAt.lte).toBeInstanceOf(Date)
  })

  // Housekeeping must not fail the cron run that sends document reminders.
  it('returns 0 rather than throwing when the sweep fails', async () => {
    mockDeleteMany.mockRejectedValue(new Error('nope'))
    await expect(purgeExpiredRateLimits()).resolves.toBe(0)
  })
})
