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
  return { ok: true, session }
}
