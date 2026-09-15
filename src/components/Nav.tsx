'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'

export default function Nav({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-surface/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="text-lg font-bold text-brand-600">
          RigLog
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/dashboard/settings" className="text-ink-muted hover:text-ink">
            {displayName}
          </Link>
          <button className="text-ink-muted hover:text-ink" onClick={() => signOut({ callbackUrl: '/login' })}>
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}
