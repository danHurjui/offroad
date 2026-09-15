import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/** Server-component equivalent of requireSession() — redirects instead of 401ing. */
export async function requireSessionOrRedirect() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return session
}
