'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'

interface Profile {
  displayName: string
  location: string | null
  isPublicProfile: boolean
  isPro: boolean
}

// RL-009: profile & settings. Every field saves immediately with a
// success toast, no separate Save button — except the toggle, which
// mutates as soon as it's flipped.
export default function SettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [location, setLocation] = useState(profile.location ?? '')
  const [isPublicProfile, setIsPublicProfile] = useState(profile.isPublicProfile)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save(patch: Record<string, unknown>) {
    setSaved(false)
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function onDeleteAccount() {
    if (!confirm('Delete your account and all vehicles/tasks/photos? This cannot be undone.')) return
    if (!confirm('This is permanent. Are you absolutely sure?')) return
    setDeleting(true)
    await fetch('/api/me/account', { method: 'DELETE' })
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => save({ displayName })}
          />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input
            id="location"
            className="input"
            placeholder="City, Country"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={() => save({ location })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isPublicProfile}
            onChange={(e) => {
              setIsPublicProfile(e.target.checked)
              save({ isPublicProfile: e.target.checked })
            }}
          />
          Make my profile public (coming soon)
        </label>
        {saved && <p className="text-sm text-green-600">Saved.</p>}
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold text-ink">Plan</h2>
        <p className="text-sm text-ink-muted">
          {profile.isPro ? 'Pro' : 'Free'} — {profile.isPro ? 'unlimited vehicles and photos.' : '1 vehicle, 10 photos per task.'}
        </p>
        {!profile.isPro && (
          <p className="mt-2 text-xs text-ink-faint">Upgrading to Pro is not available in this preview build.</p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-ink">Danger zone</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Deletes your account and every vehicle, task, and photo you own. This cannot be undone.
        </p>
        <button type="button" className="btn-danger" onClick={onDeleteAccount} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
    </div>
  )
}
