'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import FormError from './FormError'

export interface PickerVehicle {
  id: string
  label: string
  /** Ticked when the picker opens: editable now (or, looking ahead, still editable if the plan ends). */
  chosen: boolean
}

/**
 * RL-042 (#54): choose which vehicles stay editable when there are more
 * than the plan covers. Unchosen ones stay readable and nothing is
 * deleted; with no choice the oldest stay editable. `endpoint` is the
 * personal or the organisation route — both take the whole choice.
 */
export default function EditableVehiclesPicker({
  endpoint,
  vehicles,
  max,
  help,
}: {
  endpoint: string
  vehicles: PickerVehicle[]
  max: number
  help: string
}) {
  const t = useTranslations('editableChoice')
  const tc = useTranslations('common')
  const router = useRouter()
  const [chosen, setChosen] = useState(() => new Set(vehicles.filter((v) => v.chosen).map((v) => v.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const full = chosen.size >= max

  function toggle(id: string) {
    setSaved(false)
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < max) next.add(id)
      return next
    })
  }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vehicleIds: Array.from(chosen) }),
      })
      const data = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) {
        setError(data.error ?? t('failed'))
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setBusy(false)
      setError(tc('networkError'))
    }
  }

  return (
    <div className="mt-4 border-t border-surface-border pt-4">
      <h3 className="mb-1 text-sm font-semibold text-ink">{t('title')}</h3>
      <p className="mb-3 text-xs text-ink-muted">{help}</p>
      <fieldset aria-describedby={error ? 'editable-choice-error' : undefined}>
        <legend className="sr-only">{t('title')}</legend>
        <ul className="space-y-1">
          {vehicles.map((v) => (
            <li key={v.id}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={chosen.has(v.id)}
                  disabled={busy || (full && !chosen.has(v.id))}
                  onChange={() => toggle(v.id)}
                />
                <span className="min-w-0 truncate">{v.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={save} disabled={busy}>
          {busy ? t('saving') : t('save')}
        </button>
        <span className="text-xs text-ink-muted">{t('chosen', { count: chosen.size, limit: max })}</span>
        {saved && <span className="text-xs text-ink-muted" role="status">{t('saved')}</span>}
      </div>
      <p className="mt-2 text-xs text-ink-faint">{t('rateNote')}</p>
      <FormError id="editable-choice-error">{error}</FormError>
    </div>
  )
}
