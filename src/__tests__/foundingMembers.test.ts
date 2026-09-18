jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    foundingMemberCounter: { findUnique: jest.fn() },
    user: { aggregate: jest.fn(), count: jest.fn() },
  },
}))

import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import {
  claimFoundingNumber,
  foundingMemberGrant,
  foundingMemberStatus,
  foundingMemberReconciliation,
  isFoundingNumberCollision,
} from '@/lib/foundingMembers'
import { FOUNDING_MEMBER_LIMIT } from '@/lib/pro'

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock
const mockCounter = prisma.foundingMemberCounter.findUnique as jest.Mock
const mockAggregate = prisma.user.aggregate as jest.Mock
const mockCount = prisma.user.count as jest.Mock

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

describe('createUserWithFoundingGrant', () => {
  const SOURCE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'foundingMembers.ts'), 'utf8')
  const HELPER = SOURCE.slice(SOURCE.indexOf('export async function createUserWithFoundingGrant'))

  /**
   * The slot and the account have to be taken together. Claiming outside
   * the transaction would burn one of the hundred whenever the create
   * failed afterwards.
   */
  it('claims the slot inside the transaction that creates the user', () => {
    expect(HELPER).toMatch(/\$transaction/)
    expect(HELPER).toMatch(/foundingMemberGrant\(tx\)/)
    expect(HELPER).toMatch(/tx\.user\.create/)
  })

  it('grants in the same insert as the account, not a follow-up update', () => {
    expect(HELPER).toMatch(/\.\.\.grant/)
    expect(HELPER).not.toMatch(/user\.update/)
  })
})

/**
 * The gap this closes: the grant used to live only in the credentials
 * registration route, so anyone who signed up with Google silently missed
 * out. "The first hundred accounts" has to mean accounts, not passwords.
 */
describe('every signup path grants a founding slot', () => {
  const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')

  it('the credentials route creates accounts through the shared helper', () => {
    const route = read('app', 'api', 'auth', 'register', 'route.ts')
    expect(route).toMatch(/createUserWithFoundingGrant/)
    // And does not hand-roll a create that would skip the promotion.
    expect(route).not.toMatch(/prisma\.user\.create/)
  })

  it('the Google sign-in callback creates accounts through the same helper', () => {
    const auth = read('lib', 'auth.ts')
    expect(auth).toMatch(/createUserWithFoundingGrant/)
    expect(auth).not.toMatch(/prisma\.user\.create/)
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

describe('the collision fallback', () => {
  const SOURCE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'foundingMembers.ts'), 'utf8')
  const HELPER = SOURCE.slice(SOURCE.indexOf('export async function createUserWithFoundingGrant'))

  // It lives in the shared helper, so both signup paths inherit it.
  it('creates the account without the promotion rather than failing the signup', () => {
    expect(HELPER).toMatch(/isFoundingNumberCollision/)
    // Rethrows anything that is not that collision — a duplicate email is
    // a different answer to the user.
    expect(HELPER).toMatch(/if \(!isFoundingNumberCollision\(e\)\) throw e/)
    expect(HELPER).toMatch(/prisma\.user\.create\(\{ data: account \}\)/)
  })

  it('says loudly in the log that the counter needs fixing', () => {
    expect(HELPER).toMatch(/console\.error\(/)
    expect(HELPER).toMatch(/out of step/)
  })
})

/**
 * "The homepage says 100 places left, but I have 2 Pro accounts." Both
 * can be true at once: Pro arrives by three routes and only one of them
 * touches this counter. Nothing used to say so anywhere.
 */
describe('foundingMemberReconciliation', () => {
  /** counts are consumed in order: holders, comped-outside, paid. */
  function setup({ taken, highest, holders, comped, paid }: {
    taken: number; highest: number | null; holders: number; comped: number; paid: number
  }) {
    mockCounter.mockResolvedValue({ taken })
    mockAggregate.mockResolvedValue({ _max: { foundingNumber: highest } })
    mockCount
      .mockResolvedValueOnce(holders)
      .mockResolvedValueOnce(comped)
      .mockResolvedValueOnce(paid)
  }

  it('separates promotion Pro from admin comps and paying subscribers', async () => {
    setup({ taken: 0, highest: null, holders: 0, comped: 2, paid: 0 })
    const f = await foundingMemberReconciliation()
    expect(f).toMatchObject({ taken: 0, remaining: 100, holders: 0, compedOutsidePromotion: 2, paid: 0 })
    // Two Pro accounts and every founding place still open is a correct
    // state, not drift — so it must not be reported as a problem.
    expect(f.drifted).toBe(false)
  })

  it('reports drift when the counter is behind a number already issued', async () => {
    // Only reachable through operator error, and until now only visible
    // as a collision partway through someone else's signup.
    setup({ taken: 3, highest: 7, holders: 7, comped: 0, paid: 0 })
    const f = await foundingMemberReconciliation()
    expect(f.drifted).toBe(true)
    expect(f.highestIssued).toBe(7)
  })

  it('does not call a deleted founding member drift', async () => {
    // Slots never reopen, so holders below taken is by design.
    setup({ taken: 10, highest: 10, holders: 8, comped: 0, paid: 0 })
    expect((await foundingMemberReconciliation()).drifted).toBe(false)
  })

  it('treats a missing counter row as nobody having signed up', async () => {
    mockCounter.mockResolvedValue(null)
    mockAggregate.mockResolvedValue({ _max: { foundingNumber: null } })
    mockCount.mockResolvedValue(0)
    const f = await foundingMemberReconciliation()
    expect(f).toMatchObject({ taken: 0, remaining: 100, highestIssued: 0, drifted: false })
  })
})
