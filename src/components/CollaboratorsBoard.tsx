'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CollaboratorRow {
  id: string
  email: string
  label: string | null
  role: 'MECHANIC' | 'SPECIALIST'
  status: 'PENDING' | 'ACTIVE' | 'REMOVED'
  invitedAt: string
  acceptedAt: string | null
  collaboratorDisplayName: string | null
}

const STATUS_STYLES: Record<CollaboratorRow['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  REMOVED: 'bg-ink-faint/20 text-ink-faint',
}

// RL-030/031: invite form + list with resend (PENDING) / revoke
// (PENDING or ACTIVE) actions. REMOVED rows stay visible read-only — past
// collaborators, not deleted.
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
  const [busyId, setBusyId] = useState<string | null>(null)

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
      setError(data.error ?? 'Could not send invite')
      return
    }
    const created = await res.json()
    setCollaborators((prev) => [{ ...created, collaboratorDisplayName: null }, ...prev])
    setEmail('')
    setLabel('')
    router.refresh()
  }

  async function onResend(id: string) {
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/vehicles/${vehicleId}/collaborators/${id}/resend`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not resend invite')
      return
    }
    const updated = await res.json()
    setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)))
  }

  async function onRevoke(id: string) {
    if (!confirm('Revoke this collaborator\'s access? They will lose access immediately.')) return
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/vehicles/${vehicleId}/collaborators/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not revoke access')
      return
    }
    setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'REMOVED' } : c)))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onInvite} className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-ink-muted">Invite a collaborator</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="label">Label (optional)</label>
            <input
              id="label"
              type="text"
              className="input"
              placeholder="e.g. Ionescu Auto"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value as 'MECHANIC' | 'SPECIALIST')}>
            <option value="MECHANIC">Mechanic</option>
            <option value="SPECIALIST">Specialist</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary" disabled={inviting}>
          {inviting ? 'Sending…' : 'Send invite'}
        </button>
      </form>

      <div className="space-y-3">
        {collaborators.length === 0 && <p className="text-sm text-ink-faint">No collaborators yet.</p>}
        {collaborators.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-ink">
                {c.collaboratorDisplayName ?? c.label ?? c.email}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                  {c.status}
                </span>
              </p>
              <p className="text-sm text-ink-muted">
                {c.email} · {c.role === 'SPECIALIST' ? 'Specialist' : 'Mechanic'}
              </p>
            </div>
            {c.status !== 'REMOVED' && (
              <div className="flex gap-2">
                {c.status === 'PENDING' && (
                  <button
                    className="btn-secondary"
                    disabled={busyId === c.id}
                    onClick={() => onResend(c.id)}
                  >
                    Resend
                  </button>
                )}
                <button
                  className="btn-secondary text-red-600"
                  disabled={busyId === c.id}
                  onClick={() => onRevoke(c.id)}
                >
                  Revoke
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
