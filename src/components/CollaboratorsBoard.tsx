'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface CollaboratorRow {
  id: string
  email: string
  label: string | null
  role: 'MECHANIC' | 'SPECIALIST'
  status: 'PENDING' | 'ACTIVE' | 'REMOVED'
  invitedAt: string
  acceptedAt: string | null
  collaboratorUserId: string | null
  collaboratorDisplayName: string | null
}

const STATUS_STYLES: Record<CollaboratorRow['status'], string> = {
  PENDING: 'badge-warn',
  ACTIVE: 'badge-success',
  REMOVED: 'bg-ink-faint/20 text-ink-faint',
}

// RL-030/031: invite form + list with resend (PENDING) / revoke
// (PENDING or ACTIVE) actions. REMOVED rows stay visible read-only — past
// collaborators, not deleted.
import FormError from './FormError'
import { useToast, usePendingRemoval } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'
import { tryFetch } from '@/lib/writeFeedback'

export default function CollaboratorsBoard({
  vehicleId,
  collaborators: initialCollaborators,
}: {
  vehicleId: string
  collaborators: CollaboratorRow[]
}) {
  const router = useRouter()
  const [collaborators, setCollaborators] = useState(initialCollaborators)
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [role, setRole] = useState<'MECHANIC' | 'SPECIALIST'>('MECHANIC')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('collaborators')
  const tc = useTranslations('common')
  const [busyId, setBusyId] = useState<string | null>(null)
  const toast = useToast()
  const reasonFor = useFailureReason()

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInviting(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, label: label || undefined, role }),
    })
    setInviting(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? t('inviteFailed'))
      return
    }
    const created = await res.json()
    setCollaborators((prev) => [{ ...created, collaboratorDisplayName: null }, ...prev])
    toast.success(t('invited', { email }))
    setEmail('')
    setLabel('')
    router.refresh()
  }

  // Outcomes of a button, not of the invite form, so they go to a toast
  // rather than into the form's own error slot above.
  async function onResend(id: string) {
    setBusyId(id)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/collaborators/${id}/resend`, { method: 'POST' })
    setBusyId(null)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('resendFailed')))
      return
    }
    const updated = await res.json()
    setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)))
    toast.success(t('resent'))
  }

  // RL-034: shown as removed at once, revoked when the undo window closes.
  function onRevoke(c: CollaboratorRow) {
    toast.undoable({
      key: `collaborator:${c.id}`,
      message: t('revoked', { name: c.collaboratorDisplayName ?? c.label ?? c.email }),
      request: { url: `/api/vehicles/${vehicleId}/collaborators/${c.id}`, method: 'DELETE' },
      onCommitted: () => {
        setCollaborators((prev) => prev.map((row) => (row.id === c.id ? { ...row, status: 'REMOVED' } : row)))
        router.refresh()
      },
      onFailed: async (res) => toast.error(await reasonFor(res, t('revokeFailed'))),
    })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onInvite} className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-ink-muted">{t('inviteTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">{tc('email')}</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="label">{t('labelOptional')}</label>
            <input
              id="label"
              name="label"
              type="text"
              className="input"
              placeholder={t('labelPlaceholder')}
              autoComplete="off"
              autoCapitalize="words"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="role">{t('role')}</label>
          <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value as 'MECHANIC' | 'SPECIALIST')}>
            <option value="MECHANIC">{t('mechanic')}</option>
            <option value="SPECIALIST">{t('specialist')}</option>
          </select>
        </div>
        <FormError>{error}</FormError>
        <button type="submit" className="btn-primary" disabled={inviting}>
          {inviting ? t('sending') : t('sendInvite')}
        </button>
      </form>

      <div className="space-y-3">
        {collaborators.length === 0 && <p className="text-sm text-ink-faint">{t('empty')}</p>}
        {collaborators.map((c) => (
          <CollaboratorCard
            key={c.id}
            vehicleId={vehicleId}
            collaborator={c}
            busy={busyId === c.id}
            onResend={() => onResend(c.id)}
            onRevoke={() => onRevoke(c)}
          />
        ))}
      </div>
    </div>
  )
}

/** While a revoke waits out its undo window it already reads as removed. */
function CollaboratorCard({
  vehicleId,
  collaborator,
  busy,
  onResend,
  onRevoke,
}: {
  vehicleId: string
  collaborator: CollaboratorRow
  busy: boolean
  onResend: () => void
  onRevoke: () => void
}) {
  const t = useTranslations('collaborators')
  const revoking = usePendingRemoval(`collaborator:${collaborator.id}`)
  const c: CollaboratorRow = revoking ? { ...collaborator, status: 'REMOVED' } : collaborator
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium text-ink">
          {c.collaboratorDisplayName ?? c.label ?? c.email}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
            {t(`status.${c.status}`)}
          </span>
        </p>
        <p className="text-sm text-ink-muted">
          {c.email} · {c.role === 'SPECIALIST' ? t('specialist') : t('mechanic')}
        </p>
      </div>
      <div className="flex gap-2">
        {c.collaboratorUserId && (
          <Link
            href={`/dashboard/vehicles/${vehicleId}/job-report?collaboratorId=${c.collaboratorUserId}`}
            className="btn-secondary"
          >
            {t('jobReport')}
          </Link>
        )}
        {c.status !== 'REMOVED' && (
          <>
            {c.status === 'PENDING' && (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={onResend}
              >
                {t('resend')}
              </button>
            )}
            <button
              className="btn-secondary text-red-600 dark:text-red-400"
              disabled={busy}
              onClick={onRevoke}
            >
              {t('revoke')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
