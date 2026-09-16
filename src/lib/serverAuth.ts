import { redirect, notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/** Server-component equivalent of requireSession() — redirects instead of 401ing. */
export async function requireSessionOrRedirect() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  // Same reasoning as requireSession(): a deactivated account holds a
  // valid token until it expires, so the flag is enforced on every
  // request, not just at sign-in.
  if (session.user.active === false) redirect('/login?deactivated=1')
  return session
}

/**
 * Server-component admin gate. 404s rather than redirecting, so the admin
 * area doesn't announce itself to a logged-in non-admin who guesses a URL.
 */
export async function requireAdminOrNotFound() {
  const session = await requireSessionOrRedirect()
  if (!session.user.isAdmin) notFound()
  return session
}
