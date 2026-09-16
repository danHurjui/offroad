import Link from 'next/link'
import type { Metadata } from 'next'
import { PROJECT_TYPES, PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { PRO_PLANS } from '@/lib/stripe'
import { foundingMemberStatus } from '@/lib/foundingMembers'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'

export const metadata: Metadata = {
  title: 'RigLog — build tracker, restoration journal & repair log',
  description:
    'Log every modification, restoration stage and repair on your vehicle: costs, photos, receipts and document reminders, in one place. Free to start.',
}

// Pulled from the mode config rather than retyped, so the marketing copy
// can't drift from the vocabulary the app actually ships.
const MODE_PITCH: Record<(typeof PROJECT_TYPES)[number], { headline: string; body: string }> = {
  OFFROAD: {
    headline: 'Every mod, logged',
    body: 'Lift kits, winches, lights, armour — what you fitted, what it cost, and what it looked like going on. Plus a GPS trail log for where it has actually been.',
  },
  RESTORATION: {
    headline: 'From barn find to finished',
    body: 'Record the found state, then track every stage through to complete. Originality scoring and a VIN decoder help you keep a period-correct build honest.',
  },
  DAILY_DRIVER: {
    headline: 'What you fixed, what is due',
    body: 'Servicing, brakes, tyres, ITP — a straight repair history for the car you actually drive. No project to finish, just a record worth having at resale.',
  },
}

const FEATURES = [
  {
    title: 'Real cost tracking',
    body: 'Split parts from labour, DIY from workshop. See what the build has actually cost you, per category and over time.',
  },
  {
    title: 'Photos on every job',
    body: 'Before, after, and the bit in between. Compressed on upload, kept private unless you publish the build.',
  },
  {
    title: 'Document reminders',
    body: 'ITP, RCA, CASCO and rovinietă expiries, with email reminders at 30, 14 and 3 days. Historic vehicles are flagged automatically.',
  },
  {
    title: 'Your mechanic can help',
    body: 'Invite a mechanic or specialist to log their own work. They see the build, not your costs, if you would rather keep those private.',
  },
  {
    title: 'Receipts and PDF export',
    body: 'Attach receipts to any job, then export the whole history as a PDF — useful when the car changes hands.',
  },
  {
    title: 'Share it, or do not',
    body: 'Every project is private by default. Publish it when you want a public page, a shareable card, and a spot in the community feed.',
  },
]

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14">
      {eyebrow && (
        <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">{eyebrow}</div>
      )}
      <h2 className="mb-8 text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
      {children}
    </section>
  )
}

export default async function Home() {
  // Already a dynamic page (PublicHeader reads the session), so the live
  // count costs nothing extra in rendering mode. It can be a few seconds
  // stale by the time it reaches a browser, which is fine — it is a
  // marketing number, and the grant itself is decided atomically at signup.
  const founding = await foundingMemberStatus()

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="border-b border-surface-border bg-gradient-to-b from-brand-50 to-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            Every bolt, every lei, every photo — in one place.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
            RigLog is a build tracker for off-road rigs, a restoration journal for classics, and a repair
            log for the car you drive every day. Keep the history your vehicle deserves.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Start logging — free
            </Link>
            <Link href="/community" className="btn-secondary px-6 py-3 text-base">
              Browse public builds
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-faint">
            One vehicle free, forever. No card needed to start.
          </p>

          {/* Only while there are slots. An expired offer left on a landing
              page is worse than never running one. */}
          {founding.open && (
            <p className="mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-x-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm dark:border-brand-400/30 dark:bg-brand-400/10">
              <span className="font-semibold text-ink">Founding members get Pro free for life.</span>
              <span className="text-ink-muted">
                {founding.remaining} of {founding.limit}{' '}
                {founding.remaining === 1 ? 'place' : 'places'} left.
              </span>
            </p>
          )}
        </div>
      </section>

      {/* Three modes */}
      <Section eyebrow="One app, three jobs" title="Pick the mode that fits the vehicle">
        <div className="grid gap-5 sm:grid-cols-3">
          {PROJECT_TYPES.map((type) => {
            const config = PROJECT_TYPE_CONFIG[type]
            const pitch = MODE_PITCH[type]
            return (
              <div key={type} className="card flex flex-col p-6">
                <span className="badge mb-3 self-start badge-brand">{config.label}</span>
                <h3 className="mb-2 text-lg font-semibold text-ink">{pitch.headline}</h3>
                <p className="text-sm text-ink-muted">{pitch.body}</p>
                <div className="mt-4 border-t border-surface-border pt-4 text-xs text-ink-faint">
                  Tracks: {config.categories.slice(0, 4).map((c) => c.label).join(' · ')}
                  {config.categories.length > 4 ? ` · +${config.categories.length - 4} more` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Features */}
      <Section eyebrow="What you get" title="Built for the way people actually work on cars">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <h3 className="mb-1.5 font-semibold text-ink">{f.title}</h3>
              <p className="text-sm text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section eyebrow="Pricing" title="Free to start, Pro when you outgrow it">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-ink">Free</h3>
            <p className="mt-1 text-2xl font-bold text-ink">0 RON</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              <li>One vehicle</li>
              <li>Unlimited jobs, photos and receipts</li>
              <li>Document expiry reminders</li>
              <li>Total spent</li>
              <li>Job reports and collaborators</li>
            </ul>
            <Link href="/register" className="btn-secondary mt-6 w-full">
              Create an account
            </Link>
          </div>
          <div className="card border-brand-200 p-6">
            <h3 className="text-lg font-semibold text-ink">Pro</h3>
            <p className="mt-1 text-2xl font-bold text-ink">
              from {PRO_PLANS.MONTHLY.priceRon} RON
              <span className="text-base font-normal text-ink-muted">/month</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              <li>Unlimited vehicles</li>
              <li>Full cost analytics, charts and trends</li>
              <li>PDF build-history export</li>
              <li>Shareable build &amp; transformation cards</li>
              <li>Trail log, VIN decoder, originality score</li>
            </ul>
            <p className="mt-4 text-xs text-ink-faint">
              Also available annually ({PRO_PLANS.ANNUAL.priceRon} RON) or as a one-off lifetime purchase (
              {PRO_PLANS.LIFETIME.priceRon} RON).
              {founding.open && (
                <>
                  {' '}
                  The first {founding.limit} accounts pay none of it — {founding.remaining} still
                  open.
                </>
              )}
            </p>
            <Link href="/register" className="btn-primary mt-4 w-full">
              Start free, upgrade later
            </Link>
          </div>
        </div>
      </Section>

      {/* Community / feedback / donate */}
      <Section eyebrow="Open to its users" title="Help decide what gets built next">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="card p-6">
            <h3 className="mb-1.5 font-semibold text-ink">Public roadmap</h3>
            <p className="text-sm text-ink-muted">
              Report a bug or request a feature, then vote on what other people have asked for. The most
              wanted rises to the top, and you can see what is planned or already in progress.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/tickets" className="btn-secondary">
                See the roadmap
              </Link>
              <Link href="/tickets/new" className="btn-secondary">
                Open a ticket
              </Link>
            </div>
          </div>
          <div className="card p-6">
            <h3 className="mb-1.5 font-semibold text-ink">Support the project</h3>
            <p className="text-sm text-ink-muted">
              RigLog is small and self-funded. If it has saved you a spreadsheet or two, a one-off
              contribution helps cover hosting and keeps the free tier free.
            </p>
            <Link href="/donate" className="btn-primary mt-4">
              Donate
            </Link>
          </div>
        </div>
      </Section>

      {/* Closing CTA */}
      <section className="border-t border-surface-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">Start the logbook you wish you had</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            It takes a minute to add your vehicle and your first job. Everything stays private until you
            decide otherwise.
          </p>
          <Link href="/register" className="btn-primary mt-6 px-6 py-3 text-base">
            Create your free account
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
