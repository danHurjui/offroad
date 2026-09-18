import { NextResponse } from 'next/server'
import { apiError } from './apiError'
import { getServerSession, Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from './prisma'
import { isBlockedAsUnverified, VERIFICATION_SELECT } from './emailVerification'

type AuthOk = { ok: true; session: Session; error?: never }
type AuthFail = { ok: false; session?: never; error: NextResponse }
export type AuthResult = AuthOk | AuthFail

/**
 * Shared auth gate for API routes.
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const auth = await requireSession()
 *     if (!auth.ok) return auth.error
 *     const { session } = auth
 *     // ...
 *   }
 *
 * Returns 401 if no session. RigLog has no roles beyond
 * owner/collaborator, which is checked per-vehicle via
 * requireVehicleAccess() in src/lib/access.ts, not here.
 */
export async function requireSession(): Promise<AuthResult> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { ok: false, error: await apiError('unauthorized', 401) }
  }
  // A deactivated account keeps a valid signed token until it expires, so
  // the flag has to be enforced here rather than only at sign-in. The
  // token is refreshed from the database on an interval — see the jwt
  // callback in src/lib/auth.ts.
  if (session.user.active === false) {
    return {
      ok: false,
      error: await apiError('deactivated', 403),
    }
  }
  return { ok: true, session }
}

/**
 * Admin gate for the /api/admin routes.
 *
 * Returns **404**, not 403, for a non-admin: the admin surface shouldn't
 * confirm its own existence to someone probing for it. `isAdmin` rides on
 * the session token (refreshed on the same interval as `active`), so
 * revoking admin in the database takes effect within that window without
 * a database read per request.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireSession()
  if (!auth.ok) return auth
  if (!auth.session.user.isAdmin) {
    return { ok: false, error: await apiError('notFound', 404) }
  }
  return auth
}

/**
 * Session gate plus a confirmed email address.
 *
 * Wrapped around the handful of writes that reach **other people**:
 * publishing a build to the open web, inviting somebody's mechanic by
 * email, and posting on the feedback and parts boards. A private garage
 * needs no confirmed address to keep a log in — holding that hostage
 * would punish the person for a link that may still be in transit.
 *
 * ## Why this reads the database rather than the token
 *
 * `active` and `isAdmin` ride on the JWT and are refreshed on an
 * interval, which is right for them: they change rarely and a minute of
 * staleness is an acceptable price for not querying per request.
 *
 * Verification is the opposite shape. It changes exactly once, and the
 * instant after it changes is precisely when the person tries the thing
 * they were just blocked from — they clicked the link and came straight
 * back. A token-cached flag would refuse them for up to a minute with a
 * message telling them to do the thing they have already done, which is
 * the worst moment to be wrong. So it is one indexed read on a small set
 * of low-traffic write routes, and never stale.
 *
 * Answers **403**, not 401: the session is perfectly good, and a 401
 * would send a signed-in person back to the login screen to solve a
 * problem that is not there.
 */
export async function requireVerifiedSession(): Promise<AuthResult> {
  const auth = await requireSession()
  if (!auth.ok) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.session.user.id },
    select: VERIFICATION_SELECT,
  })

  if (isBlockedAsUnverified(user)) {
    return { ok: false, error: await apiError('emailNotVerified', 403) }
  }
  return auth
}
