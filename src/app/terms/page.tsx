import type { Metadata } from 'next'
import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import {
  ACCEPTABLE_USE,
  CONSUMER_AUTHORITY,
  EU_ODR_URL,
  LEGAL_LAST_UPDATED,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTROLLER,
  WITHDRAWAL_PERIOD_DAYS,
} from '@/lib/legal'
import { FREE_TIER, FOUNDING_MEMBER_LIMIT } from '@/lib/pro'
import { PRO_PLANS } from '@/lib/stripe'
import { MAX_UPLOAD_BYTES } from '@/lib/storage'

export const metadata: Metadata = {
  title: 'Terms of service · RigLog',
  description: 'The agreement between you and RigLog: what you get, what you owe, and how either side ends it.',
}

const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))

/**
 * Readable with no session, like /privacy and /cookies, and built the same
 * way: the numbers come from the code that enforces them (FREE_TIER,
 * PRO_PLANS, MAX_UPLOAD_BYTES) rather than being retyped here, so the
 * terms cannot promise one thing while the app does another.
 */
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">Terms of service</h1>
        <p className="mb-8 text-sm text-ink-faint">Last updated {LEGAL_LAST_UPDATED}</p>

        <Section title="The short version">
          <p>
            RigLog logs the work you do on your vehicles. You own what you put in and can take it
            out or delete it at any time. One vehicle is free forever; Pro costs money and can be
            cancelled. Don&rsquo;t post other people&rsquo;s private information, and don&rsquo;t
            try to break the app. If we get something wrong, tell us.
          </p>
          <p>
            The rest of this page is the same thing in the detail that matters when something goes
            wrong.
          </p>
        </Section>

        <Section title="Who you are agreeing with">
          <p>
            These terms are between you and{' '}
            {PRIVACY_CONTROLLER ?? 'the operator of this RigLog installation'} (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;). They apply from the moment you create an account.
          </p>
          <p>
            {PRIVACY_CONTACT_EMAIL ? (
              <>
                Reach us at{' '}
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
                Reach us through the{' '}
                <Link href="/tickets/new" className="text-brand-600 dark:text-brand-300 hover:underline">
                  feedback board
                </Link>
                .
              </>
            )}
          </p>
        </Section>

        <Section title="Your account">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>You need to be at least 16 to have an account.</li>
            <li>
              Give a real email address — it is the only way to reset your password, and we
              can&rsquo;t recover an account without it.
            </li>
            <li>
              Keep your password to yourself. Anything done from your account is treated as done by
              you.
            </li>
            <li>
              One account per person. If someone else needs to work on your vehicle, invite them as
              a collaborator rather than sharing a login.
            </li>
          </ul>
        </Section>

        <Section title="What you get">
          <p>
            <strong className="text-ink">Free.</strong> {FREE_TIER.vehicles} vehicle, unlimited
            tasks on it, up to {FREE_TIER.photosPerTask} photos per task, documents and reminders,
            the job-report PDF, collaborators, and your data export. Free means free — there is no
            trial that quietly ends.
          </p>
          <p>
            <strong className="text-ink">Pro.</strong> Unlimited vehicles and photos, the full cost
            analytics, PDF build history, shareable cards, the VIN decoder, trail logs and price
            alerts. {PRO_PLANS.MONTHLY.priceRon} RON monthly, {PRO_PLANS.ANNUAL.priceRon} RON
            annually, or {PRO_PLANS.LIFETIME.priceRon} RON once for lifetime access.
          </p>
          <p>
            Uploads are capped at {MAX_UPLOAD_MB}MB per file on every tier — a platform limit, not a
            paywall.
          </p>
          <p>
            We may change what each tier includes. If a change removes something you are paying for,
            we will say so before it happens and you can cancel and claim a proportional refund for
            time you have paid for and not used.
          </p>
        </Section>

        <Section title="Paying for Pro">
          <p>
            Payments are handled by Stripe. We never see or store your card details — only
            Stripe&rsquo;s reference for your customer record.
          </p>
          <p>
            Monthly and annual plans renew automatically until you cancel. Cancel any time from{' '}
            <Link href="/dashboard/settings" className="text-brand-600 dark:text-brand-300 hover:underline">
              Profile &amp; settings
            </Link>
            , which opens Stripe&rsquo;s billing portal. Cancelling stops the next charge; you keep
            Pro until the period you have already paid for runs out. Lifetime is a single payment
            with nothing to cancel.
          </p>
          <p>
            <strong className="text-ink">
              You can cancel for a full refund within {WITHDRAWAL_PERIOD_DAYS} days of buying, for
              any reason or none.
            </strong>{' '}
            EU and Romanian law give you that right on anything bought at a distance. It can be
            waived for digital content delivered immediately, but only if you are asked to waive it
            first — and we don&rsquo;t ask, so it stands. Email us, or open a ticket, and say you
            are withdrawing.
          </p>
          <p>
            After {WITHDRAWAL_PERIOD_DAYS} days we don&rsquo;t give refunds for a change of mind. We
            do refund when we have charged you in error or the service has been unusable for a
            meaningful stretch — ask.
          </p>
          <p>
            Losing Pro never deletes anything. Your vehicles, photos and history stay exactly where
            they are; the Pro-only screens stop opening, and your export keeps working so you can
            take everything with you.
          </p>
        </Section>

        <Section title="Founding members">
          <p>
            The first {FOUNDING_MEMBER_LIMIT} accounts ever created get Pro at no charge. If you are
            one of them, your settings page says so and gives your number.
          </p>
          <p>
            It is a gift rather than a purchase: nothing was paid, so there is nothing to refund and
            no subscription to cancel. It is tied to your account and cannot be transferred or
            sold.
          </p>
          <p>
            <strong className="text-ink">&ldquo;For life&rdquo; means for as long as RigLog runs.</strong>{' '}
            We will not put it behind a payment later, and buying — then cancelling — a paid plan
            will not remove it. We can withdraw it if the account breaks the rules above, on the
            same terms as any other account. If RigLog shuts down, it ends with the service; your
            export still works, and we would give notice.
          </p>
        </Section>

        <Section title="Donations">
          <p>
            A donation is a gift toward running costs. It buys nothing, unlocks nothing, and is not
            refundable — so please only give what you are happy to part with. If you meant to buy
            Pro and donated by mistake, tell us and we will sort it out.
          </p>
        </Section>

        <Section title="Your content stays yours">
          <p>
            Your photos, notes, receipts and build history belong to you. We claim no ownership of
            them.
          </p>
          <p>
            To run the service we need your permission to store your content, back it up, and show
            it back to you and to anyone you have given access — collaborators you invite, and the
            whole internet for a project you switch to public. That permission covers nothing else:
            we do not sell it, license it on, use it to advertise, or train anything on it. It ends
            when you delete the content or your account.
          </p>
          <p>
            <strong className="text-ink">Public is properly public.</strong> A public project page,
            a feedback ticket and a parts-wanted post are visible to everyone and are indexed by
            search engines. Making a project private again stops us serving it, but we cannot make a
            search engine forget a copy it has already taken. Decide accordingly before you publish
            a plate, a VIN or a driveway.
          </p>
        </Section>

        <Section title="What you must not do">
          <p>Each of these maps to something the app actually exposes:</p>
          <ul className="mt-2 space-y-3">
            {ACCEPTABLE_USE.map((entry) => (
              <li key={entry.rule} className="card p-4">
                <p className="text-sm font-medium text-ink">{entry.rule}</p>
                <p className="mt-1 text-sm text-ink-muted">{entry.because}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Collaborators">
          <p>
            Inviting someone gives them access to that vehicle and its tasks, and lets them add work
            of their own. They cannot see your other vehicles or your account settings. You choose
            who to invite and can revoke access at any time, which takes effect immediately.
          </p>
          <p>
            Work a collaborator logs on your vehicle stays in your history if they later delete
            their account — their name comes off it, the record does not.
          </p>
        </Section>

        <Section title="What we promise, and what we don’t">
          <p>
            We will run the service with reasonable care and skill, and tell you about planned
            downtime where we can.
          </p>
          <p>
            We do not promise it will never be down, never lose a request, or never have a bug.
            Treat RigLog as a convenient copy of your records, not the only one: an export button
            sits in your settings for exactly that reason, and if a vehicle&rsquo;s history matters
            to a sale or an insurance claim, keep your own copy.
          </p>
          <p>
            The VIN decoder, originality score, cost analytics and reminders are aids, not
            professional advice. Check an expiry date against the document itself before you rely on
            it.
          </p>
        </Section>

        <Section title="If something goes wrong">
          <p>
            Nothing here limits liability for death or personal injury caused by negligence, for
            fraud, or for anything else the law says cannot be limited — including your rights as a
            consumer, which these terms do not reduce.
          </p>
          <p>
            Beyond that, our liability for any claim is capped at what you have paid us in the 12
            months before it arose, and we are not liable for indirect or consequential loss —
            missed sales, lost profits, or the value of data you did not keep a copy of.
          </p>
        </Section>

        <Section title="Ending it">
          <p>
            <strong className="text-ink">You, at any time.</strong> Delete your account from
            settings. It removes your data immediately, including the uploaded files themselves. It
            cannot be undone, so take your export first if you want one.
          </p>
          <p>
            <strong className="text-ink">Us, if we have to.</strong> We can suspend or close an
            account that breaks the rules above, or that puts the service or other people at risk.
            Where it is reasonable to do so we will warn you first and give you a chance to fix it,
            and we will tell you why. If we close a paid account for a reason that isn&rsquo;t your
            breach, we refund the unused part of what you have paid.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            The date at the top changes whenever the substance does. For a change that materially
            affects you we will announce it on the{' '}
            <Link href="/tickets" className="text-brand-600 dark:text-brand-300 hover:underline">
              feedback board
            </Link>{' '}
            before it takes effect, rather than editing this page quietly. Carrying on using the
            account after that is acceptance; if you would rather not, delete the account and, if
            you are on a paid plan, ask for the unused part back.
          </p>
        </Section>

        <Section title="Law and disputes">
          <p>
            Romanian law applies, and the courts of Romania have jurisdiction. If you are a consumer
            resident elsewhere in the EU, this does not deprive you of the protection of your own
            country&rsquo;s mandatory consumer law, nor of the right to bring a claim there.
          </p>
          <p>
            Please raise a problem with us first — most things are a misunderstanding and get fixed
            the same week. If that fails you can go to{' '}
            <a
              href={CONSUMER_AUTHORITY.url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 dark:text-brand-300 hover:underline"
            >
              {CONSUMER_AUTHORITY.name}
            </a>
            , or use the EU&rsquo;s{' '}
            <a
              href={EU_ODR_URL}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 dark:text-brand-300 hover:underline"
            >
              online dispute resolution platform
            </a>
            .
          </p>
          <p>
            How we handle your personal data is in the{' '}
            <Link href="/privacy" className="text-brand-600 dark:text-brand-300 hover:underline">
              privacy policy
            </Link>
            , which is part of this agreement.
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
