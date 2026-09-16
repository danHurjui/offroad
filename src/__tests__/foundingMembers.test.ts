jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    foundingMemberCounter: { findUnique: jest.fn() },
  },
}))

import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import {
  claimFoundingNumber,
  foundingMemberGrant,
  foundingMemberStatus,
  isFoundingNumberCollision,
} from '@/lib/foundingMembers'
import { FOUNDING_MEMBER_LIMIT } from '@/lib/pro'

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock
const mockCounter = prisma.foundingMemberCounter.findUnique as jest.Mock

beforeEach(() => jest.clearAllMocks())

/** A stand-in for either the client or a transaction handle. */
function db(rows: { taken: number }[]) {
  return { $queryRaw: jest.fn().mockResolvedValue(rows) } as never
}

describe('claimFoundingNumber', () => {
  it('returns the number it was given', async () => {
    expect(await claimFoundingNumber(db([{ taken: 1 }]))).toBe(1)
    expect(await claimFoundingNumber(db([{ taken: 42 }]))).toBe(42)
  })

  /**
   * The statement's WHERE clause means an exhausted promotion updates
   * nothing and RETURNING yields no rows. That empty result is the signal,
   * not an error.
   */
  it('returns null when the promotion is exhausted', async () => {
    expect(await claimFoundingNumber(db([]))).toBeNull()
  })

  it('runs on the handle it was given, so it joins the caller’s transaction', async () => {
    const handle = db([{ taken: 3 }])
    await claimFoundingNumber(handle)
    expect((handle as unknown as { $queryRaw: jest.Mock }).$queryRaw).toHaveBeenCalledTimes(1)
    // Never the module-level client, which would escape the transaction and
    // burn a slot when the registration rolls back.
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })

  /**
   * The whole design rests on allocation being one statement. A read
   * followed by a write is the race this exists to avoid: two people at 99
   * would both see 99 and both become #100.
   */
  it('allocates in a single statement carrying the limit', async () => {
    const handle = db([{ taken: 1 }])
    await claimFoundingNumber(handle)

    const calls = (handle as unknown as { $queryRaw: jest.Mock }).$queryRaw.mock.calls
    expect(calls).toHaveLength(1)

    const sql = calls[0][0].join('?')
    expect(sql).toMatch(/INSERT INTO "FoundingMemberCounter"/)
    expect(sql).toMatch(/ON CONFLICT/i)
    expect(sql).toMatch(/WHERE[\s\S]*"taken" </i)
    expect(sql).toMatch(/RETURNING/i)
    // The limit is bound, not interpolated.
    expect(calls[0].slice(1)).toContain(FOUNDING_MEMBER_LIMIT)
  })
})

describe('foundingMemberGrant', () => {
  it('comps the account and records the number', async () => {
    const grant = await foundingMemberGrant(db([{ taken: 7 }]))
    expect(grant).toMatchObject({ foundingNumber: 7, isProComped: true })
    expect((grant as { proCompedAt: Date }).proCompedAt).toBeInstanceOf(Date)
    expect((grant as { proCompedReason: string }).proCompedReason).toMatch(/#7/)
  })

  /**
   * Load-bearing: isPro belongs to the Stripe webhook and goes false on
   * cancellation. A comp written there would be revoked by a cancellation
   * the founding member never made.
   */
  it('never touches isPro', async () => {
    const grant = await foundingMemberGrant(db([{ taken: 1 }]))
    expect(grant).not.toHaveProperty('isPro')
    expect(grant).not.toHaveProperty('proPlan')
    expect(grant).not.toHaveProperty('stripeSubscriptionId')
  })

  // An automatic grant has no granting admin, and the column is nullable
  // precisely so it can say that honestly.
  it('does not invent an admin who granted it', async () => {
    const grant = await foundingMemberGrant(db([{ taken: 1 }]))
    expect((grant as { proCompedById?: unknown }).proCompedById).toBeUndefined()
  })

  /**
   * Returning {} rather than `{ isProComped: false }` matters: spread into
   * a create, an explicit false would still be correct, but spread into a
   * future update it would silently strip a comp an admin had granted.
   */
  it('grants nothing once the promotion is over', async () => {
    expect(await foundingMemberGrant(db([]))).toEqual({})
  })
})

describe('foundingMemberStatus', () => {
  it('reports what is left', async () => {
    mockCounter.mockResolvedValue({ taken: 40 })
    expect(await foundingMemberStatus()).toEqual({
      limit: FOUNDING_MEMBER_LIMIT,
      taken: 40,
      remaining: FOUNDING_MEMBER_LIMIT - 40,
      open: true,
    })
  })

  // Nobody has registered yet — not an error state.
  it('treats a missing counter row as nothing taken', async () => {
    mockCounter.mockResolvedValue(null)
    const status = await foundingMemberStatus()
    expect(status.taken).toBe(0)
    expect(status.remaining).toBe(FOUNDING_MEMBER_LIMIT)
    expect(status.open).toBe(true)
  })

  it('closes at the limit', async () => {
    mockCounter.mockResolvedValue({ taken: FOUNDING_MEMBER_LIMIT })
    const status = await foundingMemberStatus()
    expect(status.remaining).toBe(0)
    expect(status.open).toBe(false)
  })

  /**
   * Defensive: if the counter were ever over the limit (a limit lowered
   * after launch, a manual edit), the marketing copy must not show a
   * negative number of places left.
   */
  it('never reports a negative remaining', async () => {
    mockCounter.mockResolvedValue({ taken: FOUNDING_MEMBER_LIMIT + 25 })
    const status = await foundingMemberStatus()
    expect(status.remaining).toBe(0)
    expect(status.taken).toBe(FOUNDING_MEMBER_LIMIT)
    expect(status.open).toBe(false)
  })
})

describe('the registration route', () => {
  const ROUTE = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'register', 'route.ts'),
    'utf8'
  )

  /**
   * The slot and the account have to be taken together. Claiming outside
   * the transaction would burn one of the hundred whenever a registration
   * failed afterwards.
   */
  it('claims the slot inside the transaction that creates the user', () => {
    expect(ROUTE).toMatch(/\$transaction/)
    const tx = ROUTE.slice(ROUTE.indexOf('$transaction'))
    expect(tx).toMatch(/foundingMemberGrant\(tx\)/)
    expect(tx).toMatch(/tx\.user\.create/)
  })

  it('grants in the same insert as the account, not a follow-up update', () => {
    const tx = ROUTE.slice(ROUTE.indexOf('$transaction'))
    expect(tx).toMatch(/\.\.\.grant/)
    expect(tx).not.toMatch(/user\.update/)
  })
})

/**
 * The promotion must never be the reason somebody cannot create an account.
 * If the counter and the numbers already issued disagree — only possible
 * through operator error — the unique constraint fires, and registration
 * has to fall back to an ordinary signup rather than 500.
 */
describe('isFoundingNumberCollision', () => {
  it('recognises the foundingNumber constraint', () => {
    expect(isFoundingNumberCollision({ code: 'P2002', meta: { target: ['foundingNumber'] } })).toBe(true)
    // Postgres/Prisma have reported target as a string in places.
    expect(isFoundingNumberCollision({ code: 'P2002', meta: { target: 'User_foundingNumber_key' } })).toBe(true)
  })

  // A duplicate email is a different answer to the user and must not be
  // swallowed as "sign them up without the promotion".
  it('does not match a collision on another field', () => {
    expect(isFoundingNumberCollision({ code: 'P2002', meta: { target: ['email'] } })).toBe(false)
    expect(isFoundingNumberCollision({ code: 'P2002', meta: { target: ['username'] } })).toBe(false)
  })

  it('does not match anything else', () => {
    expect(isFoundingNumberCollision({ code: 'P2025' })).toBe(false)
    expect(isFoundingNumberCollision(new Error('boom'))).toBe(false)
    expect(isFoundingNumberCollision(null)).toBe(false)
    expect(isFoundingNumberCollision(undefined)).toBe(false)
    expect(isFoundingNumberCollision('P2002')).toBe(false)
  })
})

describe('the registration fallback', () => {
  const ROUTE = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'register', 'route.ts'),
    'utf8'
  )

  it('retries without the promotion rather than failing the signup', () => {
    expect(ROUTE).toMatch(/isFoundingNumberCollision/)
    // Rethrows anything that is not that collision.
    expect(ROUTE).toMatch(/if \(!isFoundingNumberCollision\(e\)\) throw e/)
    expect(ROUTE).toMatch(/prisma\.user\.create\(\{ data: accountData \}\)/)
  })

  it('says loudly in the log that the counter needs fixing', () => {
    expect(ROUTE).toMatch(/console\.error\(/)
    expect(ROUTE).toMatch(/out of step/)
  })
})
