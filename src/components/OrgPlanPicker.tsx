'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OrgPlanId } from '@/lib/plans'

export interface PickerPlan {
  id: OrgPlanId
  tier: 'PRO' | 'BUSINESS' | 'FLEET'
  period: 'month' | 'year'
  vehicles: number
  /** Already formatted for the page's language. */
  price: string
}

/**
 * RL-042 slice 3: the company plans, monthly or annual, each opening the
 * organisation's Stripe Checkout. Prices arrive formatted from the server,
 * read from the ladder, so nothing here can quote a different figure.
 */
export default function OrgPlanPicker({ orgId, plans }: { orgId: string; plans: PickerPlan[] }) {
  const t = useTranslations('orgBilling')
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [busy, setBusy] = useState<OrgPlanId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(plan: OrgPlanId) {
    setBusy(plan)
    setError(null)
    const res = await fetch(`/api/organizations/${orgId}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !data.url) {
      setError(data.error ?? t('checkoutFailed'))
      setBusy(null)
      return
    }
    window.location.href = data.url
  }

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">{t('periodLabel')}</legend>
        {(['month', 'year'] as const).map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="org-period" checked={period === p} onChange={() => setPeriod(p)} />
            {t(`billed.${p}`)}
          </label>
        ))}
      </fieldset>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {plans
          .filter((p) => p.period === period)
          .map((p) => (
            <li key={p.id} className="card flex flex-col p-4">
              <span className="font-semibold text-ink">{t(`tier.${p.tier}`)}</span>
              <span className="text-xs text-ink-muted">{t('upToVehicles', { count: p.vehicles })}</span>
              <span className="mt-2 text-lg font-bold text-ink">
                {t(period === 'month' ? 'pricePerMonth' : 'pricePerYear', { price: p.price })}
              </span>
              <button type="button" className="btn-primary mt-3" onClick={() => choose(p.id)} disabled={busy !== null}>
                {busy === p.id ? t('redirecting') : t('choose')}
              </button>
            </li>
          ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/** Opens the organisation's Stripe billing portal. */
export function OrgBillingPortalButton({ orgId }: { orgId: string }) {
  const t = useTranslations('orgBilling')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function open() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/organizations/${orgId}/billing/portal`, { method: 'POST' }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !data.url) {
      setError(data.error ?? t('portalFailed'))
      setBusy(false)
      return
    }
    window.location.href = data.url
  }
  return (
    <div>
      <button type="button" className="btn-secondary" onClick={open} disabled={busy}>
        {busy ? t('redirecting') : t('manage')}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
