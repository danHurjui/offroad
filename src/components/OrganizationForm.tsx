'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BILLING_ADDRESS_MAX, ORG_NAME_MAX } from '@/lib/organizations'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

type Values = { name: string; cui: string; billingAddress: string }

/**
 * RL-038: create an organisation, or (with `organizationId`) edit its
 * details. The CUI is checked on the server against its check digit.
 */
export default function OrganizationForm({ organizationId, initial }: { organizationId?: string; initial?: Values }) {
  const t = useTranslations('organizations')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [form, setForm] = useState<Values>(initial ?? { name: '', cui: '', billingAddress: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Values>) => setForm({ ...form, ...patch })
  const editing = organizationId !== undefined
  const errorId = editing ? `org-error-${organizationId}` : 'org-error-new'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(editing ? `/api/organizations/${organizationId}` : '/api/organizations', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    toast.success(t(editing ? 'saved' : 'created'))
    if (editing) {
      router.refresh()
      return
    }
    const created = await res.json().catch(() => null)
    router.push(created?.id ? `/dashboard/organizations/${created.id}` : '/dashboard/organizations')
  }

  const prefix = editing ? `org-${organizationId}` : 'org-new'
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label" htmlFor={`${prefix}-name`}>{t('name')}</label>
        <input
          id={`${prefix}-name`} className="input" required maxLength={ORG_NAME_MAX} autoComplete="organization"
          value={form.name} onChange={(e) => set({ name: e.target.value })} aria-describedby={errorId}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor={`${prefix}-cui`}>{t('cui')}</label>
          <input
            id={`${prefix}-cui`} className="input" inputMode="text" autoCapitalize="characters" placeholder="RO…"
            value={form.cui} onChange={(e) => set({ cui: e.target.value })} aria-describedby={`${prefix}-cui-help ${errorId}`}
          />
          <p id={`${prefix}-cui-help`} className="mt-1 text-xs text-ink-faint">{t('cuiHelp')}</p>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${prefix}-billing`}>{t('billingAddress')}</label>
          <input
            id={`${prefix}-billing`} className="input" maxLength={BILLING_ADDRESS_MAX} autoComplete="street-address"
            value={form.billingAddress} onChange={(e) => set({ billingAddress: e.target.value })} aria-describedby={errorId}
          />
        </div>
      </div>
      <FormError id={errorId}>{error}</FormError>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? t('saving') : t(editing ? 'save' : 'create')}
      </button>
    </form>
  )
}
