import type { Metadata } from 'next'
import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import { COOKIES, LEGAL_LAST_UPDATED, LOCAL_STORAGE_ENTRIES } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Cookie policy · RigLog',
  description: 'Every cookie RigLog sets, what it does, and why you are not asked to consent.',
}

export default function CookiesPage() {
  const allStrictlyNecessary = COOKIES.every((c) => c.strictlyNecessary)

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">Cookie policy</h1>
        <p className="mb-10 text-sm text-ink-faint">Last updated {LEGAL_LAST_UPDATED}</p>

        <section className="mb-10 space-y-3 text-sm leading-relaxed text-ink-muted">
          <h2 className="mb-3 text-xl font-bold text-ink">Why there is no consent banner</h2>
          <p>
            RigLog sets {COOKIES.length} kinds of cookie and every one of them is needed for the app
            to work: staying logged in, and protecting the sign-in form. There are no analytics,
            advertising or tracking cookies, and no third-party scripts that set any.
          </p>
          <p>
            Cookies that are strictly necessary to provide a service you asked for are exempt from
            the consent requirement in the ePrivacy Directive — but they still have to be disclosed,
            which is what this page is for. If that ever changes and a cookie is added that
            isn&rsquo;t strictly necessary, this page will say so and you will be asked first.
          </p>
          {!allStrictlyNecessary && (
            // Rendered from the data, so this can't be forgotten: adding a
            // non-essential cookie to the list makes this warning appear.
            <p className="card note-warn p-3 text-sm text-ink">
              Some cookies listed below are not strictly necessary. This page needs updating and a
              consent flow adding before that cookie ships.
            </p>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold text-ink">The cookies</h2>
          <div className="space-y-4">
            {COOKIES.map((cookie) => (
              <div key={cookie.name} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all font-mono text-sm text-ink">{cookie.name}</code>
                  {cookie.strictlyNecessary && <span className="badge badge-neutral">Essential</span>}
                </div>
                <p className="mt-2 text-sm text-ink-muted">{cookie.purpose}</p>
                <p className="mt-1 text-xs text-ink-faint">Lasts: {cookie.duration}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold text-ink">Stored in your browser, but not cookies</h2>
          <p className="mb-4 text-sm leading-relaxed text-ink-muted">
            A few things are kept in your browser&rsquo;s local storage instead. They stay on your
            device, are never sent to the server, and are gone if you clear site data.
          </p>
          <div className="space-y-4">
            {LOCAL_STORAGE_ENTRIES.map((entry) => (
              <div key={entry.name} className="card p-4">
                <code className="font-mono text-sm text-ink">{entry.name}</code>
                <p className="mt-2 text-sm text-ink-muted">{entry.purpose}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 space-y-3 text-sm leading-relaxed text-ink-muted">
          <h2 className="mb-3 text-xl font-bold text-ink">Turning them off</h2>
          <p>
            Every browser lets you block or delete cookies. Blocking the ones above will log you out
            and stop you logging back in — the session cookie <em>is</em> the login. There is no way
            around that short of not having accounts.
          </p>
          <p>
            Reading the public pages — this one, the{' '}
            <Link href="/" className="text-brand-600 dark:text-brand-300 hover:underline">
              homepage
            </Link>
            , the{' '}
            <Link href="/tickets" className="text-brand-600 dark:text-brand-300 hover:underline">
              feedback board
            </Link>{' '}
            and public build pages — needs no cookies at all.
          </p>
          <p>
            More about what RigLog stores is in the{' '}
            <Link href="/privacy" className="text-brand-600 dark:text-brand-300 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
