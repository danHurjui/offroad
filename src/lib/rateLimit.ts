import { prisma } from '@/lib/prisma'
import { apiErrorMessage } from './apiError'

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * ## Why not an in-memory counter
 * A module-level `Map` is per-instance. Serverless functions don't share
 * memory, scale horizontally and cold-start constantly, so an in-process
 * counter bounds nothing in production — it would pass tests locally and
 * silently do nothing once deployed.
 *
 * ## Why not Vercel's WAF
 * Its rate limiting is a paid-plan feature (this project is on Hobby) and
 * keys on IP at the edge. Several limits here need to be per-account,
 * which the edge can't see. A WAF rule is still a good *additional* layer
 * against crude floods if the project ever moves to Pro — it isn't a
 * replacement for these.
 *
 * ## Atomicity
 * The check is one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
 * statement. A read-then-write version (`findUnique` then `update`) races:
 * two concurrent requests both read count=4, both write 5, and the fifth
 * and sixth requests both pass a limit of 5. Postgres serialises the
 * upsert on the primary key, so the returned count is the true post-
 * increment value and a burst can't slip extra requests through.
 */

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

export interface RateLimitResult {
  ok: boolean
  /** Requests left in this window (0 once blocked). */
  remaining: number
  /** Seconds until the window resets — sent as Retry-After when blocked. */
  retryAfterSeconds: number
}

/**
 * The tuned limits. Auth endpoints are deliberately tight (credential
 * stuffing is the real threat); content endpoints are loose enough that a
 * normal person will never see them but a script will.
 */
export const RATE_LIMITS = {
  /**
   * Login is limited on two dimensions with deliberately different
   * tightness, because they carry different false-positive risk:
   *
   * - `login` keys on the **email**, so it only ever affects the account
   *   being attacked. It can be tight.
   * - `loginIp` keys on the **IP**, which is shared: an office NAT, a
   *   university, or a mobile carrier's CGNAT can put hundreds of real
   *   users behind one address. Too tight here locks out innocent people,
   *   so it's set only low enough to blunt password spraying (many
   *   accounts, one host) and leans on the per-email limit for the
   *   targeted case.
   */
  login: { limit: 10, windowSeconds: 15 * 60 },
  loginIp: { limit: 50, windowSeconds: 15 * 60 },
  /** Same shared-IP reasoning — enough to stop bulk signup, not a household. */
  register: { limit: 20, windowSeconds: 60 * 60 },
  /**
   * Password reset sends mail. The per-email limit is the one that
   * matters: it stops someone's inbox being flooded. The IP limit is
   * loose for the shared-address reason above.
   */
  forgotPassword: { limit: 3, windowSeconds: 60 * 60 },
  forgotPasswordIp: { limit: 20, windowSeconds: 60 * 60 },
  resetPassword: { limit: 20, windowSeconds: 60 * 60 },
  /**
   * Resending the confirmation link. Keyed on the **user id** — there is
   * always a session behind it — so the tight budget only ever affects the
   * one account pressing the button, and cannot be tripped by a stranger
   * sharing a NAT. The IP companion is the looser one, per the rule above.
   */
  verifyEmailSend: { limit: 5, windowSeconds: 60 * 60 },
  verifyEmailSendIp: { limit: 20, windowSeconds: 60 * 60 },
  /**
   * Presenting a confirmation token. Not about mail volume: it is what
   * stops someone grinding through 32-byte tokens. Loose enough that a
   * person opening the link in three browsers and a prefetching mail
   * client never notices.
   */
  verifyEmailConsume: { limit: 30, windowSeconds: 60 * 60 },
  /** Public write surfaces. */
  ticketCreate: { limit: 10, windowSeconds: 60 * 60 },
  ticketComment: { limit: 30, windowSeconds: 60 * 60 },
  partsRequest: { limit: 10, windowSeconds: 60 * 60 },
  /** RL-038: creating an organisation, keyed on the user id. */
  orgCreate: { limit: 5, windowSeconds: 60 * 60 },
  /** Organisation invitations and resends — each one is an email to an address the owner chose. */
  orgInvite: { limit: 20, windowSeconds: 60 * 60 },
  /** Donation checkout creates a Stripe session and a DB row per call. */
  donationCheckout: { limit: 10, windowSeconds: 60 * 60 },
  /**
   * The GDPR data export walks every table belonging to the account and
   * serialises the lot. It is a legal right, so the budget is generous
   * enough that nobody exercising it in good faith is ever refused — but
   * it is also by far the most expensive read in the app, so a script
   * calling it in a loop shouldn't be free.
   */
  dataExport: { limit: 10, windowSeconds: 60 * 60 },
  /**
   * RL-041 fleet reports: the next most expensive read after the data
   * export, and it walks a whole fleet. Keyed on the user id. Each of the
   * three files is one unit, so a month's CSVs and PDF for a few periods
   * fit comfortably; a script looping over years does not.
   */
  fleetReport: { limit: 30, windowSeconds: 60 * 60 },
  /**
   * RL-042: choosing which vehicles stay editable over the plan's
   * allowance. Keyed on the user (or organisation), and tight on purpose:
   * swapping the choice back and forth would edit every vehicle a few at
   * a time, which is the plan the account is not paying for.
   */
  editableChoice: { limit: 5, windowSeconds: 24 * 60 * 60 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS

/**
 * Consumes one unit against `key` and reports whether the caller may
 * proceed.
 *
 * Fails **open**: if the database is unreachable the request is allowed
 * rather than 500ing. A limiter outage shouldn't take down login — the
 * tradeoff is that an attacker who can break the DB also gets unlimited
 * attempts, but at that point they've broken something much more
 * interesting than the limiter.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  subject: string,
  rule: RateLimitRule = RATE_LIMITS[name],
): Promise<RateLimitResult> {
  const key = `${name}:${subject}`

  try {
    const rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, NOW() + ${`${rule.windowSeconds} seconds`}::interval)
      ON CONFLICT ("key") DO UPDATE SET
        -- An elapsed window starts over; a live one increments. Both
        -- branches happen inside the one statement, so there's no gap for
        -- a concurrent request to read a stale count.
        "count" = CASE
          WHEN "RateLimit"."expiresAt" <= NOW() THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "RateLimit"."expiresAt" <= NOW()
            THEN NOW() + ${`${rule.windowSeconds} seconds`}::interval
          ELSE "RateLimit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `

    const row = rows[0]
    if (!row) return { ok: true, remaining: rule.limit - 1, retryAfterSeconds: 0 }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 1000),
    )

    if (row.count > rule.limit) {
      return { ok: false, remaining: 0, retryAfterSeconds }
    }
    return { ok: true, remaining: rule.limit - row.count, retryAfterSeconds }
  } catch {
    return { ok: true, remaining: rule.limit, retryAfterSeconds: 0 }
  }
}

/**
 * Best-effort client IP.
 *
 * On Vercel these headers are set by the platform's edge and can be
 * trusted. **Anywhere the app is reachable directly they cannot** — a
 * client can send any `x-forwarded-for` it likes and rotate it per
 * request to sidestep an IP-keyed limit. That is why every limit that
 * *can* key on a user id does (a session id is unforgeable), and only
 * genuinely pre-auth endpoints fall back to IP. If this is ever deployed
 * behind a different proxy, check that the proxy overwrites rather than
 * appends to these headers.
 */
export function clientIp(headers?: Headers | null): string {
  // Tolerates a missing/!Headers object rather than throwing: a limiter
  // must never be the reason a request 500s, and not every caller (nor
  // every test harness) hands over a real Headers instance.
  if (!headers || typeof headers.get !== 'function') return 'unknown'

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    // Leftmost entry is the originating client; the rest are proxy hops.
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Standard 429 body + Retry-After, so clients can back off properly. */
export async function rateLimitResponse(result: RateLimitResult): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: await apiErrorMessage('rateLimited'),
      // The historic code, kept: clients already switch on it.
      code: 'RATE_LIMITED',
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
      },
    },
  )
}

/**
 * Drops counters for windows that have already elapsed. Called from cron.
 * Swallows its own failures — housekeeping must not fail the cron run that
 * actually sends the document reminders.
 */
export async function purgeExpiredRateLimits(): Promise<number> {
  try {
    const { count } = await prisma.rateLimit.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    })
    return count
  } catch {
    return 0
  }
}
