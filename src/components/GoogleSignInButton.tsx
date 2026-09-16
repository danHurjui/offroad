'use client'

import { useEffect, useState } from 'react'
import { getProviders, signIn } from 'next-auth/react'

/**
 * "Continue with Google", shown only when Google sign-in is actually
 * configured.
 *
 * It asks NextAuth which providers are registered rather than reading an
 * environment variable, for two reasons: these pages are client components
 * and static, so server env is not available to them, and
 * `/api/auth/providers` reflects the real registration in
 * `src/lib/auth.ts`. A button that cannot be wrong is better than one kept
 * in sync by hand — an unconfigured Google button sends people to a Google
 * error page, which reads as "this app is broken" rather than "a setting
 * is missing".
 *
 * Renders nothing until the answer is known, so it never flashes in and
 * out for deployments without Google.
 */
export default function GoogleSignInButton({ callbackUrl = '/dashboard' }: { callbackUrl?: string }) {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProviders()
      .then((providers) => {
        if (!cancelled) setAvailable(Boolean(providers?.google))
      })
      // A failed lookup means no button rather than a broken one.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!available) return null

  return (
    <button
      type="button"
      className="btn-secondary mt-3 w-full"
      onClick={() => signIn('google', { callbackUrl })}
    >
      Continue with Google
    </button>
  )
}
