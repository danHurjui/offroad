import type { Metadata } from 'next'
import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTROLLER,
  RETENTION,
  SUB_PROCESSORS,
} from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy policy · RigLog',
  description: 'What RigLog stores, who it is shared with, and how to get a copy or have it deleted.',
}

/**
 * Readable with no session, like the homepage and the feedback board.
 * Everything factual comes from src/lib/legal.ts, which is written from
 * what the code does — a policy that contradicts the implementation is
 * worse than none.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">Privacy policy</h1>
        <p className="mb-10 text-sm text-ink-faint">Last updated {LEGAL_LAST_UPDATED}</p>

        <Section title="The short version">
          <p>
            RigLog stores what you put into it — your vehicles, the work you log, your photos and
            documents — plus the email address you signed up with. There is no advertising, no
            tracking, and no analytics script of any kind. Nothing is sold, and nothing is shared
            except with the services listed below that are needed to run the app.
          </p>
          <p>
            You can download everything we hold, or delete all of it, from{' '}
            <Link href="/dashboard/settings" className="text-brand-600 dark:text-brand-300 hover:underline">
              Profile &amp; settings
            </Link>
            . Neither needs you to ask anyone.
          </p>
        </Section>

        <Section title="Who is responsible">
          <p>
            {PRIVACY_CONTROLLER ?? 'The operator of this RigLog installation'} is the data
            controller for the information described here.
          </p>
          <p>
            {PRIVACY_CONTACT_EMAIL ? (
              <>
                For anything in this policy, including a data request, write to{' '}
                <a
                  href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                  className="text-brand-600 dark:text-brand-300 hover:underline"
                >
                  {PRIVACY_CONTACT_EMAIL}
                </a>
                .
              </>
            ) : (
              <>
                For anything in this policy, open a ticket on the{' '}
                <Link href="/tickets/new" className="text-brand-600 dark:text-brand-300 hover:underline">
                  feedback board
                </Link>
                . You do not need to wait for a reply to exercise the rights below — the export and
                deletion buttons in your settings do both immediately.
              </>
            )}
          </p>
        </Section>

        <Section title="What we collect, and why">
          <Definition term="Your account">
            Email address, display name, and a public username generated from that name. Optionally
            a location and an avatar. We need the email to log you in and to send password resets.
            Passwords are stored only as a bcrypt hash — nobody, including us, can read them back.
          </Definition>
          <Definition term="What you log">
            Vehicles, tasks, costs, photos, receipts, documents and their expiry dates, wishlist
            items, and GPS tracks if you use the trail log. This is the app&rsquo;s purpose; it is
            stored because you asked it to be.
          </Definition>
          <Definition term="What you post publicly">
            Feedback tickets, votes and comments, parts-wanted posts, and any project you switch to
            public. These are visible to anyone, including people without an account, and public
            projects are indexed by search engines. That is the point of them — but it is worth
            being deliberate about it.
          </Definition>
          <Definition term="Server logs and abuse counters">
            Ordinary web-server logs, and short-lived counters used to stop brute-force login
            attempts and spam. Details are in the retention table below.
          </Definition>
          <p>
            We do not ask for, and have no use for, anything in the &ldquo;special category&rdquo;
            sense — health, politics, beliefs, biometrics. Please don&rsquo;t put it in a task note.
          </p>
        </Section>

        <Section title="Why we are allowed to (legal basis)">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink">Performance of a contract</strong> — your account and
              everything you log. You asked for an app that remembers your build; it cannot do that
              without storing it.
            </li>
            <li>
              <strong className="text-ink">Legitimate interests</strong> — keeping the service
              secure and working: rate limiting, abuse prevention, server logs.
            </li>
            <li>
              <strong className="text-ink">Consent</strong> — optional email and push notifications
              about projects you follow. You turn them on, and you can turn them off in settings at
              any time.
            </li>
            <li>
              <strong className="text-ink">Legal obligation</strong> — keeping records of payments.
            </li>
          </ul>
        </Section>

        <Section title="Who else sees it">
          <p>
            Only the services needed to run the app. Each one gets the minimum that its job
            requires, and none of them is an advertising network.
          </p>
          <div className="mt-4 space-y-4">
            {SUB_PROCESSORS.map((processor) => (
              <div key={processor.name} className="card p-4">
                <h3 className="font-semibold text-ink">{processor.name}</h3>
                <p className="mt-1 text-sm text-ink-muted">{processor.purpose}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  <span className="font-medium text-ink">What they receive: </span>
                  {processor.dataShared}
                </p>
                {processor.when && <p className="mt-1 text-xs text-ink-faint">{processor.when}</p>}
              </div>
            ))}
          </div>
          <p className="mt-4">
            Some of these are based outside the EU. Where that is the case, the transfer relies on
            the European Commission&rsquo;s standard contractual clauses or an adequacy decision,
            through the provider&rsquo;s own data processing terms.
          </p>
          <p>
            We would also hand over data if legally compelled to — a court order, for example. That
            is not a loophole we go looking for.
          </p>
        </Section>

        <Section title="Collaborators">
          <p>
            If you invite a mechanic or specialist to a vehicle, they can see that vehicle and its
            tasks, and add work of their own. They cannot see your other vehicles, your account
            settings, or anything else. You can hide cost totals from them with a setting on the
            vehicle, and you can revoke an invitation at any time. Revoking removes their access
            immediately.
          </p>
        </Section>

        <Section title="How long it is kept">
          <div className="mt-2 space-y-3">
            {RETENTION.map((entry) => (
              <div key={entry.what} className="card p-4">
                <h3 className="text-sm font-semibold text-ink">{entry.what}</h3>
                <p className="mt-1 text-sm text-ink-muted">{entry.howLong}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Your rights">
          <p>Under the GDPR you can:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink">Get a copy</strong> of everything we hold — the{' '}
              <em>Download my data</em> button in settings produces it immediately, as JSON.
            </li>
            <li>
              <strong className="text-ink">Correct</strong> anything wrong — edit it in the app.
            </li>
            <li>
              <strong className="text-ink">Delete everything</strong> — the <em>Delete account</em>{' '}
              button in settings removes your account, every project, and the uploaded files
              themselves. It is immediate and cannot be undone.
            </li>
            <li>
              <strong className="text-ink">Take it elsewhere</strong> — the same export is
              structured JSON, meant to be read by something other than us.
            </li>
            <li>
              <strong className="text-ink">Object, or ask us to restrict processing</strong>, and
              withdraw consent for notifications at any time.
            </li>
            <li>
              <strong className="text-ink">Complain</strong> to a supervisory authority. In Romania
              that is{' '}
              <a
                href="https://www.dataprotection.ro"
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 dark:text-brand-300 hover:underline"
              >
                ANSPDCP
              </a>
              ; elsewhere in the EU, your own country&rsquo;s authority.
            </li>
          </ul>
          <p>
            The first two and the middle two are buttons rather than requests on purpose. You should
            not have to ask permission to leave.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            RigLog sets only the cookies needed to keep you logged in and to protect the sign-in
            form. There are no tracking or advertising cookies, which is why you are not asked to
            consent to any.{' '}
            <Link href="/cookies" className="text-brand-600 dark:text-brand-300 hover:underline">
              The full list is here
            </Link>
            .
          </p>
        </Section>

        <Section title="Children">
          <p>
            RigLog is not aimed at children and we do not knowingly hold data about anyone under 16.
            If you believe we do, tell us and it will be removed.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes in substance, the date at the top changes with it. Material
            changes will be announced on the{' '}
            <Link href="/tickets" className="text-brand-600 dark:text-brand-300 hover:underline">
              feedback board
            </Link>{' '}
            rather than made quietly.
          </p>
        </Section>
      </main>
      <PublicFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-bold text-ink">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  )
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <p>
      <strong className="text-ink">{term}. </strong>
      {children}
    </p>
  )
}
