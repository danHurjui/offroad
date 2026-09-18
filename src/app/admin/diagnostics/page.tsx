import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  configurationGroups,
  foundingMembersCheck,
  stripeAccountCheck,
  stripePricesCheck,
  worstStatus,
  type CheckStatus,
  type DiagnosticCheck,
} from '@/lib/diagnostics'

export const metadata: Metadata = { title: 'Diagnostics — RigLog', robots: { index: false } }

// Reads environment and asks Stripe about the account on every load. A
// cached answer here would be worse than none: the whole point is to say
// whether the fix you just deployed took effect.
export const dynamic = 'force-dynamic'

const BADGE: Record<CheckStatus, string> = {
  ok: 'badge badge-success',
  warn: 'badge badge-warn',
  fail: 'badge badge-danger',
}

function Check({ check, statusLabel, readsLabel }: {
  check: DiagnosticCheck
  statusLabel: string
  readsLabel: string
}) {
  return (
    <li className="border-t border-surface-border py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={BADGE[check.status]}>{statusLabel}</span>
        <span className="font-medium text-ink">{check.label}</span>
      </div>
      <p className="mt-2 text-sm text-ink-muted">{check.detail}</p>
      {check.variables && check.variables.length > 0 && (
        <p className="mt-2 text-xs text-ink-faint">
          {readsLabel}{' '}
          {check.variables.map((v, i) => (
            <span key={v}>
              {i > 0 && ', '}
              <code className="rounded bg-background px-1 py-0.5">{v}</code>
            </span>
          ))}
        </p>
      )}
    </li>
  )
}

export default async function AdminDiagnosticsPage() {
  const t = await getTranslations('admin')

  const groups = configurationGroups()

  // The live account check only makes sense once the key is well-formed,
  // and it is the slowest thing on the page — so it runs after the cheap
  // checks rather than gating them. The founding count is a database read
  // and independent of it, so the two go together.
  const [accountCheck, prices, founding] = await Promise.all([
    stripeAccountCheck(),
    stripePricesCheck(),
    foundingMembersCheck(),
  ])
  const withAccount = groups.map((group) =>
    group.id === 'payments'
      ? {
          ...group,
          // `prices` is null when there is no key or no price to ask about;
          // the shape checks have already said so and repeating it would
          // read as a second problem.
          checks: [...group.checks, accountCheck, ...(prices ? [prices] : []), founding],
        }
      : group
  )

  const overall = worstStatus(withAccount)
  const statusLabel: Record<CheckStatus, string> = {
    ok: t('diagnosticsOk'),
    warn: t('diagnosticsWarn'),
    fail: t('diagnosticsFail'),
  }
  const summary =
    overall === 'ok'
      ? t('diagnosticsAllGood')
      : overall === 'warn'
        ? t('diagnosticsNeedsAttention')
        : t('diagnosticsBroken')

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{t('diagnosticsTitle')}</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">{t('diagnosticsIntro')}</p>

      <div
        className={`card mt-5 p-4 text-sm text-ink ${overall === 'ok' ? '' : overall === 'warn' ? 'note-warn' : 'note-danger'}`}
      >
        <span className={BADGE[overall]}>{statusLabel[overall]}</span>{' '}
        <span className="ml-1">{summary}</span>
      </div>

      <div className="mt-6 space-y-6">
        {withAccount.map((group) => (
          <section key={group.id} className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {group.label}
            </h2>
            <ul className="mt-3">
              {group.checks.map((check) => (
                <Check
                  key={check.id}
                  check={check}
                  statusLabel={statusLabel[check.status]}
                  readsLabel={t('diagnosticsReads')}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
