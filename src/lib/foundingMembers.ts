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

/** The account fields every signup path supplies; the grant is added here. */
export interface NewAccount {
  email: string
  displayName: string
  username: string | null
  password?: string | null
  accountType: 'OWNER'
  active: boolean
}

/**
 * Creates an account, taking a founding-member slot if one is free.
 *
 * Shared by both signup paths — the credentials route and the Google
 * `signIn` callback — because the promotion has to mean "the first hundred
 * accounts", not "the first hundred that happened to use a password".
 * Google signups silently missed out when this logic lived only in the
 * register route.
 *
 * The slot and the account are taken in one transaction, so a create that
 * fails afterwards returns the slot instead of burning one of the hundred.
 * A `foundingNumber` collision — only reachable when the counter is out of
 * step with the numbers already issued, which is operator error — falls
 * back to an ordinary account rather than refusing the signup, because a
 * broken promotion must not stop people joining.
 */
export async function createUserWithFoundingGrant(account: NewAccount) {
  try {
    return await prisma.$transaction(async (tx) => {
      const grant = await foundingMemberGrant(tx)
      return tx.user.create({ data: { ...account, ...grant } })
    })
  } catch (e) {
    if (!isFoundingNumberCollision(e)) throw e
    console.error(
      '[founding] foundingNumber collided — the counter is out of step with the numbers already ' +
        'issued. Creating this account without the promotion. Reset the counter to ' +
        'MAX("foundingNumber") to fix it.',
      e
    )
    return prisma.user.create({ data: account })
  }
}

export interface FoundingMemberReconciliation extends FoundingMemberStatus {
  /** The highest number ever handed to an account that still exists. */
  highestIssued: number
  /** Accounts still holding a founding number. */
  holders: number
  /** Comped Pro that did **not** come from the promotion — an admin granted it. */
  compedOutsidePromotion: number
  /** Paid subscriptions, which the promotion has nothing to do with. */
  paid: number
  /**
   * True when the counter is behind the numbers already issued, so the
   * next signup will be handed a number that is taken.
   */
  drifted: boolean
}

/**
 * The counter checked against reality, for the admin diagnostics screen.
 *
 * Two questions this answers that `foundingMemberStatus()` cannot.
 *
 * **"Why does the homepage say 100 places left when accounts already have
 * Pro?"** Because Pro arrives by three different routes and only one of
 * them is this promotion: an admin comp (`isProComped` set from
 * `/admin/users`) and a Stripe subscription (`isPro`) both leave the
 * counter untouched, correctly. Showing the three side by side is the
 * whole answer, and without it the landing page's number looks wrong when
 * it is right.
 *
 * **"Is the counter still telling the truth?"** It can drift from the
 * numbers actually issued through operator error — a restored backup, a
 * hand-edited row — and the only thing that notices today is
 * `foundingNumber`'s unique constraint firing mid-signup, which falls back
 * to an ordinary account and logs. By then the landing page has already
 * been advertising places that were gone. `drifted` says so first.
 *
 * Counting the two Pro columns directly is deliberate here and is the one
 * place it is right: this is a breakdown *by source*, not an entitlement
 * check. Anything deciding whether someone gets a Pro feature still has to
 * ask `hasPro()` with `PRO_SELECT` — see src/lib/pro.ts.
 */
export async function foundingMemberReconciliation(): Promise<FoundingMemberReconciliation> {
  const status = await foundingMemberStatus()

  const [highest, holders, compedOutsidePromotion, paid] = await Promise.all([
    prisma.user.aggregate({ _max: { foundingNumber: true } }),
    prisma.user.count({ where: { foundingNumber: { not: null } } }),
    prisma.user.count({ where: { isProComped: true, foundingNumber: null } }),
    prisma.user.count({ where: { isPro: true } }),
  ])

  const highestIssued = highest._max.foundingNumber ?? 0

  return {
    ...status,
    highestIssued,
    holders,
    compedOutsidePromotion,
    paid,
    // Holders can legitimately be fewer than `taken` — deleting an account
    // does not reopen its slot, by design — so the drift that matters is
    // the counter sitting *below* a number already handed out.
    drifted: highestIssued > status.taken,
  }
}
