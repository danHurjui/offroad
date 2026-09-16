'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/pushClient'
import { proKind } from '@/lib/pro'

interface Profile {
  displayName: string
  location: string | null
  isPublicProfile: boolean
  isPro: boolean
  isProComped: boolean
  proPlan: 'MONTHLY' | 'ANNUAL' | 'LIFETIME' | null
  stripeCustomerId: string | null
  notifyFollowedEmail: boolean
  notifyFollowedPush: boolean
}

const PLAN_LABELS: Record<NonNullable<Profile['proPlan']>, string> = {
  MONTHLY: 'Pro (Monthly)',
  ANNUAL: 'Pro (Annual)',
  LIFETIME: 'Pro (Lifetime)',
}

// RL-009: profile & settings. Every field saves immediately with a
// success toast, no separate Save button — except the toggle, which
// mutates as soon as it's flipped.
export default function SettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [location, setLocation] = useState(profile.location ?? '')
  const [isPublicProfile, setIsPublicProfile] = useState(profile.isPublicProfile)
  const kind = proKind(profile)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [notifyFollowedEmail, setNotifyFollowedEmail] = useState(profile.notifyFollowedEmail)
  const [notifyFollowedPush, setNotifyFollowedPush] = useState(profile.notifyFollowedPush)
  const [pushStatus, setPushStatus] = useState<string | null>(null)

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

  async function onManageBilling() {
    setPortalError(null)
    setPortalLoading(true)
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    setPortalLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setPortalError(data.error ?? 'Could not open billing portal')
      return
    }
    const { url } = await res.json()
    window.location.href = url
  }

  async function onEnablePush() {
    setPushStatus(null)
    const result = await subscribeToPush()
    if (result === 'subscribed') {
      setNotifyFollowedPush(true)
      save({ notifyFollowedPush: true })
      setPushStatus('Push notifications enabled on this device.')
    } else if (result === 'denied') {
      setPushStatus('Notification permission was denied in your browser.')
    } else if (result === 'unsupported') {
      setPushStatus('Push notifications are not supported on this device/browser.')
    } else {
      setPushStatus('Push notifications are not configured on this server yet.')
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
            name="displayName"
            className="input"
            autoComplete="name"
            autoCapitalize="words"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => save({ displayName })}
          />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            className="input"
            placeholder="City, Country"
            autoComplete="address-level2"
            autoCapitalize="words"
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
        {saved && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold text-ink">Plan</h2>
        {/* Describe what the person actually has. Someone on a comp gets
            Pro features but has no subscription, so they must not be shown
            a billing plan they never bought — nor nagged to upgrade. */}
        <p className="text-sm text-ink-muted">
          {kind === 'paid'
            ? profile.proPlan
              ? PLAN_LABELS[profile.proPlan]
              : 'Pro'
            : kind === 'comped'
              ? 'Pro — complimentary'
              : 'Free'}{' '}
          —{' '}
          {kind === 'none' ? '1 vehicle, 10 photos per task.' : 'unlimited vehicles and photos.'}
        </p>
        {kind === 'comped' && (
          <p className="mt-1 text-xs text-ink-faint">
            Pro was granted to you by the RigLog team. There is nothing to pay and no subscription to
            manage.
          </p>
        )}
        {kind !== 'none' ? (
          kind === 'paid' && profile.stripeCustomerId && (
            <>
              <button type="button" className="btn-secondary mt-3" onClick={onManageBilling} disabled={portalLoading}>
                {portalLoading ? 'Opening…' : 'Manage subscription'}
              </button>
              {portalError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{portalError}</p>}
            </>
          )
        ) : (
          <Link href="/dashboard/upgrade" className="btn-primary mt-3 inline-block">
            Upgrade to Pro
          </Link>
        )}
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="mb-1 font-semibold text-ink">Following notifications</h2>
        <p className="text-sm text-ink-muted">Get notified when a project you follow completes a task or adds photos.</p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={notifyFollowedEmail}
            onChange={(e) => {
              setNotifyFollowedEmail(e.target.checked)
              save({ notifyFollowedEmail: e.target.checked })
            }}
          />
          Email me
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={notifyFollowedPush}
            onChange={(e) => {
              const checked = e.target.checked
              setNotifyFollowedPush(checked)
              save({ notifyFollowedPush: checked })
              if (!checked) unsubscribeFromPush()
            }}
          />
          Push notify me
        </label>
        <button type="button" className="btn-secondary" onClick={onEnablePush}>
          Enable push on this device
        </button>
        {pushStatus && <p className="text-sm text-ink-muted">{pushStatus}</p>}
      </div>

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-ink">Danger zone</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Deletes your account and every vehicle, task, document and photo you own — including the
          uploaded files themselves, not just the entries pointing at them. Records of any donations
          are kept for accounting, with your account detached from them. This cannot be undone, so
          take a copy of your data first if you want one.
        </p>
        <button type="button" className="btn-danger" onClick={onDeleteAccount} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
    </div>
  )
}
