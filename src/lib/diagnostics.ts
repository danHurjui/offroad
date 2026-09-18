import { resolveAppUrl } from '@/lib/appUrl'
import { emailProvider } from '@/lib/email'
import { isPushConfigured } from '@/lib/webpush'
import { isStorageConfigured, storageBackend } from '@/lib/storage'
import {
  stripeConfigProblems,
  isStripeTestMode,
  describeStripeFailure,
  getStripe,
  priceIdFor,
  StripeConfigError,
  PRO_PLANS,
  type ProPlanId,
} from '@/lib/stripe'
import { DONATION_CURRENCY } from '@/lib/donations'
import { foundingMemberReconciliation } from '@/lib/foundingMembers'

/**
 * What is and isn't configured on this deployment, for the admin
 * diagnostics screen.
 *
 * Every integration here already refuses loudly and logs why — email,
 * storage, push and Stripe each say the variable to set. That is only
 * useful to someone reading a server log, and the symptom always reaches
 * the operator somewhere else: a donor sees "could not start payment", an
 * upload 500s, a follower's notification never arrives. This collects the
 * same answers into a page they can open.
 *
 * ## Why the detail text is not translated
 *
 * It names environment variables, Stripe dashboard paths and provider
 * settings, none of which are translated where the operator will go to
 * fix them. Translating the sentence around `STRIPE_SECRET_KEY` would
 * make it harder to act on, not easier. The page's own chrome — headings,
 * status words — is translated like every other admin screen.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface DiagnosticCheck {
  /** Stable identifier, used as a React key and as a test anchor. */
  id: string
  label: string
  status: CheckStatus
  /** What is true right now, and what to change when it isn't right. */
  detail: string
  /** The environment variables this check reads. */
  variables?: string[]
}

export interface DiagnosticGroup {
  id: string
  label: string
  checks: DiagnosticCheck[]
}

/** Whether anything here needs the operator's attention. */
export function worstStatus(groups: DiagnosticGroup[]): CheckStatus {
  const all = groups.flatMap((g) => g.checks.map((c) => c.status))
  if (all.includes('fail')) return 'fail'
  if (all.includes('warn')) return 'warn'
  return 'ok'
}

/**
 * Joins two sentences when the first may not be punctuated. The Stripe
 * config messages are written to stand alone, so some end in a full stop
 * and some don't; without this the page reads "STRIPE_PRICE_ANNUAL is not
 * set Donations are unaffected".
 */
function sentences(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(' ')
}

function paymentChecks(): DiagnosticCheck[] {
  const problems = stripeConfigProblems()
  const checks: DiagnosticCheck[] = []

  const blocking = problems.filter((p) => p.affects === 'payments')
  if (blocking.length === 0) {
    checks.push({
      id: 'stripe-key',
      label: 'Stripe secret key',
      status: 'ok',
      variables: ['STRIPE_SECRET_KEY'],
      detail: isStripeTestMode()
        ? 'Set, and it is a TEST key (sk_test_…), so checkout opens, test cards work, and a real ' +
          'card is declined. Nothing here can change that — this reads STRIPE_SECRET_KEY, so the ' +
          'switch happens where that variable is set, not in the app. To go live: turn the ' +
          'dashboard\'s test-mode toggle off, copy Developers → API keys → Secret key (sk_live_…), ' +
          'set it on the Production environment, and REDEPLOY — changing a variable does not ' +
          'touch the deployment already running. Replace the three STRIPE_PRICE_ ids in the same ' +
          'pass: a Price created in test mode does not exist in live mode.'
        : 'Set, and it is a live key. Real cards are charged.',
    })
  } else {
    for (const problem of blocking) {
      checks.push({
        id: 'stripe-key',
        label: 'Stripe secret key',
        status: 'fail',
        variables: [problem.variable],
        detail: sentences(problem.message, 'Until this is fixed, donations and Pro both fail'),
      })
    }
  }

  for (const problem of problems.filter((p) => p.affects === 'pro')) {
    checks.push({
      id: `price-${problem.variable}`,
      label: `Pro price (${problem.variable})`,
      status: 'fail',
      variables: [problem.variable],
      detail: sentences(
        problem.message,
        'Donations are unaffected — they build their amount inline and need no Price id'
      ),
    })
  }

  for (const problem of problems.filter((p) => p.affects === 'settlement')) {
    checks.push({
      id: 'stripe-webhook',
      label: 'Stripe webhook',
      status: 'fail',
      variables: [problem.variable],
      detail: problem.message,
    })
  }

  return checks
}

/**
 * Asks Stripe about the account the key belongs to.
 *
 * This is the check that the shape tests above cannot do. A key can be
 * perfectly well-formed and still be revoked, belong to someone else's
 * account, or belong to an account that has not finished activation — and
 * an unactivated account is the one failure that looks exactly like a
 * working setup from the outside, right up until a real card is entered.
 *
 * Admin-only and never part of rendering a payment, so a slow or failing
 * call costs a diagnostics page and nothing else.
 */
export async function stripeAccountCheck(): Promise<DiagnosticCheck> {
  try {
    const account = await getStripe().accounts.retrieveCurrent()
    const currencies = [account.default_currency, ...(account.country === 'RO' ? ['ron'] : [])]
    const takesDonationCurrency = currencies.includes(DONATION_CURRENCY)

    if (!account.charges_enabled) {
      return {
        id: 'stripe-account',
        label: 'Stripe account',
        status: 'fail',
        detail:
          `The key reaches account ${account.id}, but Stripe has charges disabled on it` +
          (account.details_submitted
            ? '. The details have been submitted, so this is usually Stripe still reviewing them, ' +
              'or a request for more information waiting on the dashboard.'
            : ' because activation is unfinished. Complete the business details on the Stripe ' +
              'dashboard — checkout cannot open in live mode until then.'),
      }
    }

    return {
      id: 'stripe-account',
      label: 'Stripe account',
      status: takesDonationCurrency ? 'ok' : 'warn',
      detail:
        `Reached account ${account.id}` +
        (account.country ? ` (${account.country})` : '') +
        ', charges enabled' +
        (takesDonationCurrency
          ? '.'
          : `. Its default currency is ${(account.default_currency ?? 'unknown').toUpperCase()}, ` +
            `while donations are charged in ${DONATION_CURRENCY.toUpperCase()}. Stripe can present ` +
            'a foreign currency, but confirm it is enabled for this account if donations fail.'),
    }
  } catch (e) {
    const failure = describeStripeFailure(e)
    return {
      id: 'stripe-account',
      label: 'Stripe account',
      // A configuration fault is already reported by its own check above;
      // repeating it as an account failure would read as two problems.
      status: failure.kind === 'config' ? 'warn' : 'fail',
      detail:
        failure.kind === 'config'
          ? 'Not checked — no usable key to check it with.'
          : sentences(failure.summary, failure.advice),
    }
  }
}

/**
 * Where the Pro accounts actually came from.
 *
 * The homepage advertises the founding promotion from its counter, and
 * that number looks wrong to the site's owner the moment any account
 * holds Pro without the counter having moved — which is the normal state,
 * because an admin comp and a Stripe subscription are separate routes to
 * Pro that this promotion knows nothing about. Showing the three together
 * is the answer to "it says 100 places left but I have 2 Pro accounts".
 *
 * It also catches the case where the counter really is wrong, which today
 * only surfaces as a unique-constraint collision partway through somebody
 * else's signup.
 */
export async function foundingMembersCheck(): Promise<DiagnosticCheck> {
  const f = await foundingMemberReconciliation()

  const breakdown =
    `${f.holders} from the promotion, ${f.compedOutsidePromotion} comped by an admin, ` +
    `${f.paid} paying.`

  if (f.drifted) {
    return {
      id: 'founding-members',
      label: 'Founding members',
      status: 'fail',
      detail: sentences(
        `The counter says ${f.taken} taken, but #${f.highestIssued} has already been issued, so ` +
          'the homepage is advertising places that are gone and the next signup will collide and ' +
          `quietly miss out. Set the counter to ${f.highestIssued}`,
        `Pro accounts: ${breakdown}`
      ),
    }
  }

  return {
    id: 'founding-members',
    label: 'Founding members',
    status: 'ok',
    detail: sentences(
      f.open
        ? `${f.taken} of ${f.limit} places taken, ${f.remaining} still advertised on the homepage`
        : `All ${f.limit} places are gone, so the homepage no longer offers them`,
      `Pro accounts: ${breakdown}`,
      f.compedOutsidePromotion > 0 || f.paid > 0
        ? 'Only the first of those three moves the counter — an admin comp and a Stripe ' +
          'subscription leave it alone, which is why the number of Pro accounts and the number ' +
          'of founding places taken do not have to match'
        : ''
    ),
  }
}

/**
 * Whether the configured Price ids actually exist under the current key.
 *
 * Test and live are separate object spaces, so the moment
 * STRIPE_SECRET_KEY is switched to live, three perfectly valid-looking
 * `price_…` ids created in test mode stop existing. Nothing about the id
 * says which mode it came from, so the shape checks cannot catch it and
 * the first symptom is "No such price" on a customer's upgrade attempt.
 * Asking Stripe is the only way to know, and this is the one screen where
 * that round trip is free.
 *
 * Returns null when there is nothing to check — no usable key, or no
 * price configured — since the shape checks already report those.
 */
export async function stripePricesCheck(): Promise<DiagnosticCheck | null> {
  let stripe
  try {
    stripe = getStripe()
  } catch {
    return null
  }

  const configured: Array<{ variable: string; priceId: string }> = []
  for (const plan of Object.keys(PRO_PLANS) as ProPlanId[]) {
    try {
      configured.push({ variable: PRO_PLANS[plan].envVar, priceId: priceIdFor(plan) })
    } catch (e) {
      if (!(e instanceof StripeConfigError)) throw e
    }
  }
  if (configured.length === 0) return null

  const results = await Promise.all(
    configured.map(async ({ variable, priceId }) => {
      try {
        await stripe.prices.retrieve(priceId)
        return { variable, priceId, outcome: 'ok' as const, why: '' }
      } catch (e) {
        // Only `resource_missing` means the price genuinely is not there.
        // Anything else — an unreachable Stripe, a refused key — has to be
        // reported as itself, or this check invents a wrong cause for a
        // failure that has nothing to do with the price ids.
        const missing = (e as { code?: string })?.code === 'resource_missing'
        return {
          variable,
          priceId,
          outcome: missing ? ('missing' as const) : ('unknown' as const),
          why: describeStripeFailure(e).summary,
        }
      }
    })
  )

  const mode = isStripeTestMode() ? 'test' : 'live'
  const missing = results.filter((r) => r.outcome === 'missing')
  const unchecked = results.filter((r) => r.outcome === 'unknown')

  if (missing.length > 0) {
    return {
      id: 'stripe-prices',
      label: 'Pro prices',
      status: 'fail',
      variables: missing.map((m) => m.variable),
      detail: sentences(
        `Stripe has no such price in ${mode} mode for ` +
          missing.map((m) => `${m.variable} (${m.priceId})`).join(', ') +
          '. The usual cause is a Price created in the other mode — the id is real, just not in ' +
          `${mode}. Open the Product catalogue in ${mode} mode and copy the Price id from there`,
        'Donations are unaffected; they need no Price id'
      ),
    }
  }

  if (unchecked.length > 0) {
    return {
      id: 'stripe-prices',
      label: 'Pro prices',
      status: 'warn',
      variables: unchecked.map((u) => u.variable),
      detail: sentences(
        'Could not check whether the configured Price ids exist — this is a problem reaching ' +
          'Stripe, not evidence that anything is wrong with them',
        unchecked[0].why
      ),
    }
  }

  return {
    id: 'stripe-prices',
    label: 'Pro prices',
    status: 'ok',
    detail: `All ${results.length} configured Price ids exist in ${mode} mode.`,
    variables: configured.map((c) => c.variable),
  }
}

/** Everything that can be answered without a network call. */
export function configurationGroups(): DiagnosticGroup[] {
  const appUrl = resolveAppUrl()
  const provider = emailProvider()
  const backend = storageBackend()

  return [
    { id: 'payments', label: 'Payments', checks: paymentChecks() },
    {
      id: 'site',
      label: 'Site',
      checks: [
        {
          id: 'app-url',
          label: 'Public address',
          status: appUrl ? 'ok' : 'fail',
          variables: ['NEXTAUTH_URL'],
          detail: appUrl
            ? `Links are built as ${appUrl}. If that is not this site's address, every password ` +
              'reset, invitation and Stripe redirect points at the wrong place.'
            : 'No usable public address. Password resets, invitations, Stripe redirects and the ' +
              'sitemap have nowhere to point. Set NEXTAUTH_URL to the full origin, for example ' +
              'https://riglog.ro — a bare hostname or a pasted secret does not count.',
        },
        {
          id: 'storage',
          label: 'Photo and document storage',
          status: isStorageConfigured() ? 'ok' : 'fail',
          variables: ['BLOB_READ_WRITE_TOKEN'],
          detail: isStorageConfigured()
            ? backend === 'blob'
              ? 'Vercel Blob. Uploads are durable.'
              : 'Local disk. Correct off Vercel; anything deployed to Vercel needs a Blob store.'
            : 'Running on Vercel with no Blob store linked, so uploads are being written to a ' +
              'read-only filesystem and every one of them fails with a 500. Link a Blob store to ' +
              'the project and redeploy — see DEPLOY.md.',
        },
      ],
    },
    {
      id: 'notifications',
      label: 'Notifications',
      checks: [
        {
          id: 'email',
          label: 'Email',
          status: provider ? 'ok' : 'fail',
          variables: ['BREVO_API_KEY', 'RESEND_API_KEY', 'EMAIL_FROM'],
          detail: provider
            ? `Sending through ${provider === 'brevo' ? 'Brevo' : 'Resend'}, from ` +
              `${process.env.EMAIL_FROM ?? 'an unset EMAIL_FROM'}. That address must be one you ` +
              'have verified with the provider, or every send is rejected.'
            : 'No provider key set, so email is only written to the server log. Password resets ' +
              'refuse outright rather than pretending to have sent. Set BREVO_API_KEY (a single ' +
              'verified sender address is enough) or RESEND_API_KEY.',
        },
        {
          id: 'push',
          label: 'Web push',
          status: isPushConfigured() ? 'ok' : 'warn',
          variables: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'],
          detail: isPushConfigured()
            ? 'VAPID keys are set.'
            : 'No VAPID keys, so every push notification is dropped — including for people who ' +
              'granted the browser permission and were told notifications were on. Email ' +
              'notifications are unaffected. See DEPLOY.md, "Configure Web Push".',
        },
      ],
    },
  ]
}
