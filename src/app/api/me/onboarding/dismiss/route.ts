import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { closeOnboarding } from '@/lib/onboarding'

/**
 * Hides the getting-started checklist for good (RL-036).
 *
 * No body and no rate limit rule, for the same reason as the language
 * switch: it sets one timestamp on the caller's own row, only ever from
 * null, so a repeat is a no-op and there is nothing to throttle.
 */
export async function POST() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error

  try {
    await closeOnboarding(auth.session.user.id)
  } catch (e) {
    console.error('[onboarding] could not close the checklist', e)
    return await apiError('internalError', 500)
  }
  return NextResponse.json({ ok: true })
}
