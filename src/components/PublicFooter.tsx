import Link from 'next/link'

export default function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-surface-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-ink">RigLog</div>
          <p className="text-ink-muted">Build tracker, restoration journal & repair log.</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-ink-muted">
          <Link href="/community" className="hover:text-ink">
            Community
          </Link>
          <Link href="/tickets" className="hover:text-ink">
            Roadmap
          </Link>
          <Link href="/tickets/new" className="hover:text-ink">
            Report a bug
          </Link>
          <Link href="/donate" className="hover:text-ink">
            Donate
          </Link>
          <Link href="/login" className="hover:text-ink">
            Log in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
