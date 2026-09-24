'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { SITE_NAME_MAX } from '@/lib/sites'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

export type SiteRow = { id: string; name: string; vehicles: number }

/**
 * #103: an organisation's sites (depots), for OWNERs and FLEET_MANAGERs —
 * add, rename, delete. A vehicle is put at a site from its own edit page.
 * Deleting is confirmed rather than undoable, and says what it does to the
 * vehicles there: they stay, with every record, and belong to no site.
 */
export default function OrganizationSites({ organizationId, sites }: { organizationId: string; sites: SiteRow[] }) {
  const t = useTranslations('organizations.sites')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/organizations/${organizationId}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('addFailed')))
      return
    }
    setName('')
    router.refresh()
  }

  async function onRename(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setRowBusy(editing.id)
    const res = await tryFetch(`/api/organizations/${organizationId}/sites/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editing.name }),
    })
    setRowBusy(null)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('renameFailed')))
      return
    }
    setEditing(null)
    router.refresh()
  }

  async function onDelete(site: SiteRow) {
    if (!window.confirm(t('confirmDelete', { name: site.name, count: site.vehicles }))) return
    setRowBusy(site.id)
    const res = await tryFetch(`/api/organizations/${organizationId}/sites/${site.id}`, { method: 'DELETE' })
    setRowBusy(null)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('deleteFailed')))
      return
    }
    toast.success(t('deleted', { name: site.name }))
    router.refresh()
  }

  return (
    <section className="card mb-6 space-y-3 p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <p className="text-xs text-ink-muted">{t('help')}</p>
      </div>

      {sites.length > 0 && (
        <ul className="divide-y divide-surface-border">
          {sites.map((site) => (
            <li key={site.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              {editing?.id === site.id ? (
                <form onSubmit={onRename} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`site-${site.id}`}>{t('name')}</label>
                  <input
                    id={`site-${site.id}`} className="input min-w-0 flex-1" maxLength={SITE_NAME_MAX} required autoFocus
                    value={editing.name} onChange={(e) => setEditing({ id: site.id, name: e.target.value })}
                  />
                  <button type="submit" className="btn-secondary" disabled={rowBusy === site.id}>{t('save')}</button>
                  <button type="button" className="text-sm text-ink-muted hover:underline" onClick={() => setEditing(null)}>{t('cancel')}</button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 truncate text-sm text-ink">
                    {site.name} <span className="text-xs text-ink-faint">· {t('vehicles', { count: site.vehicles })}</span>
                  </span>
                  <span className="flex gap-3 text-sm">
                    <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => setEditing({ id: site.id, name: site.name })}>
                      {t('rename')}
                    </button>
                    <button type="button" className="text-red-600 hover:underline dark:text-red-400" disabled={rowBusy === site.id} onClick={() => onDelete(site)}>
                      {t('delete')}
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="org-site-name">{t('name')}</label>
          <input
            id="org-site-name" className="input" maxLength={SITE_NAME_MAX} required autoComplete="off"
            value={name} onChange={(e) => setName(e.target.value)} aria-describedby="org-site-error" placeholder={t('placeholder')}
          />
        </div>
        <button type="submit" className="btn-secondary" disabled={busy}>{t('add')}</button>
      </form>
      <FormError id="org-site-error">{error}</FormError>
    </section>
  )
}
