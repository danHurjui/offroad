import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import { FOUNDING_MEMBER_LIMIT } from './pro'

/**
 * The founding-member promotion: the first FOUNDING_MEMBER_LIMIT accounts
 * ever created get Pro free, permanently.
 *
 * The grant is `isProComped`, never `isPro`. That is not a detail — the two
 * columns exist separately precisely so that Stripe, which owns `isPro` and
 * sets it false on cancellation, can never revoke a comp. A founding member
 * who later buys and cancels a subscription must come out of it still
 * holding their comp. Every Pro gate already asks `hasPro()`, so nothing
 * else needs to know this promotion exists.
 *
 * ## Why a counter rather than counting users
 *
 * `SELECT count(*) FROM "User"` reopens a slot every time somebody deletes
 * their account, which would turn "the first 100 users" into "the first 100
 * users who are still here" and let slot #100 be handed out again and
 * again. This counter only ever goes up.
 *
 * ## Why one statement rather than read-then-write
 *
 * Two people registering when 99 slots are gone must not both become #100.
 * A `count()` followed by a `create()` is a read-then-write race and would
 * do exactly that. The allocation is instead a single conditional UPDATE
 * whose WHERE clause carries the limit, so the database decides — the same
 * reasoning as the rate limiter's atomic upsert and the one-vote-per-user
 * constraint on the feedback board.
 */

/** A `prisma` client or a transaction handle from `prisma.$transaction`. */
type Db = PrismaClient | Prisma.TransactionClient

/**
 * Takes the next founding-member slot, or returns null when they are gone.
 *
 * Call inside the transaction that creates the user, so a registration that
 * fails afterwards rolls the slot back instead of burning it.
 */
export async function claimFoundingNumber(db: Db): Promise<number | null> {
  // One statement: insert the counter row on first use, otherwise increment
  // it — but only while it is under the limit. When it is not, DO UPDATE
  // matches nothing, RETURNING yields no rows, and the caller learns the
  // promotion is over. There is no window between the check and the write
  // because they are the same write.
  const rows = await db.$queryRaw<{ taken: number }[]>`
    INSERT INTO "FoundingMemberCounter" ("id", "taken", "updatedAt")
    VALUES (1, 1, NOW())
    ON CONFLICT ("id") DO UPDATE
      SET "taken" = "FoundingMemberCounter"."taken" + 1, "updatedAt" = NOW()
      WHERE "FoundingMemberCounter"."taken" < ${FOUNDING_MEMBER_LIMIT}
    RETURNING "taken"
  `

  return rows[0]?.taken ?? null
}

/**
 * The `User` fields that make someone a founding member, or an empty object
 * when the promotion is exhausted. Spread into `prisma.user.create`.
 *
 * Returning the fields rather than updating the row afterwards keeps the
 * grant in the same INSERT as the account: there is no instant where the
 * user exists without the Pro they were promised, and no second write that
 * can fail on its own.
 */
export async function foundingMemberGrant(db: Db) {
  const foundingNumber = await claimFoundingNumber(db)
  if (foundingNumber === null) return {}

  return {
    foundingNumber,
    isProComped: true,
    proCompedAt: new Date(),
    proCompedReason: `Founding member #${foundingNumber} — first ${FOUNDING_MEMBER_LIMIT} accounts`,
    // proCompedById stays null: nobody granted this, the promotion did.
  }
}

export interface FoundingMemberStatus {
  limit: number
  taken: number
  remaining: number
  /** Whether a new signup right now would still get one. */
  open: boolean
}

/**
 * How many slots are left, for the marketing copy and the admin screens.
 *
 * Read-only and unlocked, so it can be a stale count by the time it reaches
 * a browser. That is fine for "12 left" on a landing page and is never what
 * decides a grant — `claimFoundingNumber` is the only thing that does, and
 * it decides atomically.
 */
export async function foundingMemberStatus(): Promise<FoundingMemberStatus> {
  const counter = await prisma.foundingMemberCounter
    .findUnique({ where: { id: 1 }, select: { taken: true } })
    // A missing row means nobody has signed up yet, not an error.
    .catch(() => null)

  const taken = Math.min(counter?.taken ?? 0, FOUNDING_MEMBER_LIMIT)
  const remaining = Math.max(FOUNDING_MEMBER_LIMIT - taken, 0)

  return { limit: FOUNDING_MEMBER_LIMIT, taken, remaining, open: remaining > 0 }
}

/**
 * Whether an error is the `foundingNumber` unique constraint firing.
 *
 * That constraint is the last line of defence behind the allocator: the
 * counter and the numbers already issued can only disagree through
 * operator error (a restored backup, a hand-edited row), and when they do
 * this is what catches it. Registration treats it as "skip the promotion",
 * never as "refuse the account" — a broken promotion must not stop people
 * signing up.
 *
 * Matched on Prisma's P2002 plus the field name rather than on P2002
 * alone, so a collision on `email` or `username` still surfaces as the
 * distinct failure it is.
 */
export function isFoundingNumberCollision(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { code?: unknown; meta?: { target?: unknown } }
  if (e.code !== 'P2002') return false

  const target = e.meta?.target
  if (Array.isArray(target)) return target.includes('foundingNumber')
  return typeof target === 'string' && target.includes('foundingNumber')
}
