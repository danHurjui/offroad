import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { collectUserData } from '@/lib/personalData'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'

/**
 * GDPR Art. 15 (access) + Art. 20 (portability): download everything this
 * account holds, as JSON.
 *
 * JSON rather than a zip of CSVs because the data is deeply nested — a
 * vehicle has tasks which have photos — and flattening it into sheets
 * loses the structure that makes it portable. "Structured, commonly used
 * and machine-readable" is what Art. 20 asks for, and this is all three.
 *
 * Keyed on the user id, not the IP: an export is inherently per-account,
 * and a session id can't be rotated the way `x-forwarded-for` can
 * (pitfall #13).
 */
export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const limit = await consumeRateLimit('dataExport', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  try {
    const data = await collectUserData(session.user.id)
    const stamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Makes the browser save it instead of rendering a wall of JSON.
        'Content-Disposition': `attachment; filename="riglog-data-${stamp}.json"`,
        // It contains everything about one person; no cache, anywhere.
        'Cache-Control': 'no-store, private',
      },
    })
  } catch {
    return await apiError('internalError', 500)
  }
}
