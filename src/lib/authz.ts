import { NextResponse } from 'next/server'
import { getServerSession, Session } from 'next-auth'
import { authOptions } from '@/lib/auth'

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
    return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  // A deactivated account keeps a valid signed token until it expires, so
  // the flag has to be enforced here rather than only at sign-in. The
  // token is refreshed from the database on an interval — see the jwt
  // callback in src/lib/auth.ts.
  if (session.user.active === false) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'This account has been deactivated' }, { status: 403 }),
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
    return { ok: false, error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return auth
}
