'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ASSIGNMENT_NOTE_MAX } from '@/lib/assignments'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

type AssignmentRow = {
  id: string
  driverName: string
  startedAt: string
  endedAt: string | null
  note: string | null
  startKm: number | null
  endKm: number | null
  photos: Array<{ id: string; stage: 'START' | 'END'; url: string }>
}

const km = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('ro-RO')} km`)

const fmt = (iso: string) => new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * RL-040: the current driver (with End), an assign form when there is none,
 * and the history. Not optimistic: the database decides whether a second
 * active driver is allowed, and its answer is what is shown.
 */
export default function VehicleDrivers({
  vehicleId,
  drivers,
  assignments,
}: {
  vehicleId: string
  drivers: Array<{ id: string; name: string }>
  assignments: AssignmentRow[]
}) {
  const t = useTranslations('drivers')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const active = assignments.find((a) => a.endedAt === null) ?? null
  const [driverUserId, setDriverUserId] = useState(drivers[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [startKm, setStartKm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onAssign(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverUserId, note, km: startKm }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('assignFailed')))
      return
    }
    toast.success(t('assigned'))
    setNote('')
    setStartKm('')
    router.refresh()
  }

  async function onEnd(assignment: AssignmentRow) {
    if (!window.confirm(t('confirmEnd', { name: assignment.driverName }))) return
    setBusy(true)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/assignments/${assignment.id}/end`, { method: 'POST' })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('endFailed')))
      return
    }
    toast.success(t('ended'))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">{t('current')}</h2>
        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{active.driverName}</div>
              <div className="text-xs text-ink-muted">{t('since', { date: fmt(active.startedAt) })}</div>
              {active.note && <div className="mt-1 text-xs text-ink-faint">{active.note}</div>}
            </div>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onEnd(active)}>
              {t('end')}
            </button>
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noDrivers')}</p>
        ) : (
          <form onSubmit={onAssign} className="space-y-3">
            <p className="text-sm text-ink-muted">{t('none')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="label" htmlFor="assign-driver">{t('driver')}</label>
                <select id="assign-driver" className="input" value={driverUserId} onChange={(e) => setDriverUserId(e.target.value)} aria-describedby="assign-error">
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="assign-km">{t('startKm')}</label>
                <input
                  id="assign-km" className="input" inputMode="numeric" pattern="[0-9]*" value={startKm}
                  onChange={(e) => setStartKm(e.target.value.replace(/[^0-9]/g, ''))} aria-describedby="assign-km-help assign-error"
                />
                <p id="assign-km-help" className="mt-1 text-xs text-ink-faint">{t('startKmHelp')}</p>
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="assign-note">{t('note')}</label>
                <input id="assign-note" className="input" maxLength={ASSIGNMENT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <FormError id="assign-error">{error}</FormError>
            <button type="submit" className="btn-primary" disabled={busy || !driverUserId}>
              {busy ? t('assigning') : t('assign')}
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('history')}</h2>
        {assignments.length === 0 ? (
          <p className="card p-4 text-sm text-ink-faint">{t('noHistory')}</p>
        ) : (
          <ul className="card divide-y divide-surface-border">
            {assignments.map((a) => (
              <li key={a.id} className="p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{a.driverName}</span>
                  <span className="text-xs text-ink-muted">
                    {fmt(a.startedAt)} — {a.endedAt ? fmt(a.endedAt) : t('ongoing')}
                  </span>
                </div>
                <div className="text-xs text-ink-muted">{t('kmRange', { start: km(a.startKm), end: a.endedAt ? km(a.endKm) : t('ongoing') })}</div>
                {a.note && <div className="text-xs text-ink-faint">{a.note}</div>}
                {a.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.photos.map((p) => (
                      <a key={p.id} href={`/api/uploads/${p.url}`} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- served through the access-checked uploads route */}
                        <img src={`/api/uploads/${p.url}`} alt={t(p.stage === 'START' ? 'photoStart' : 'photoEnd')} className="h-14 w-14 rounded object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
