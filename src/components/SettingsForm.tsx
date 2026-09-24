'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/pushClient'
import { proKind, FREE_TIER } from '@/lib/pro'
import { vehicleLimit, type StoredPlanId } from '@/lib/plans'
import AvatarField from './AvatarField'
import EditableVehiclesPicker from './EditableVehiclesPicker'

interface Profile {
  id: string
  avatarUrl: string | null
  displayName: string
  location: string | null
  isPublicProfile: boolean
  isPro: boolean
  isProComped: boolean
  foundingNumber: number | null
  proPlan: StoredPlanId | null
  grandfatheredAt: Date | null
  stripeCustomerId: string | null
  notifyFollowedEmail: boolean
  notifyFollowedPush: boolean
}

/** Catalogue keys, so the plan name follows the interface language. */
const PLAN_KEYS: Record<StoredPlanId, string> = {
  MONTHLY: 'planMonthly',
  ANNUAL: 'planAnnual',
  LIFETIME: 'planLifetime',
  PERSONAL_MONTHLY: 'planPersonalMonthly',
  PERSONAL_ANNUAL: 'planPersonalAnnual',
  PERSONAL_LIFETIME: 'planPersonalLifetime',
}

// RL-009: profile & settings. Every field saves immediately with a
// success toast, no separate Save button — except the toggle, which
// mutates as soon as it's flipped.
/** RL-042: the vehicle allowance, worked out on the server. */
interface Allowance {
  /** Personal vehicles read-only now (over the current plan's allowance). */
  readOnlyNow: string[]
  /** The ones that would be read-only if the paid plan ended. */
  ifPlanEnds: string[]
  freeVehicles: number
  /** Every personal vehicle, for choosing which stay editable. */
  vehicles: Array<{ id: string; label: string; editableNow: boolean; editableIfPlanEnds: boolean }>
}

export default function SettingsForm({ profile, allowance }: { profile: Profile; allowance: Allowance }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const te = useTranslations('editableChoice')
  const router = useRouter()
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [location, setLocation] = useState(profile.location ?? '')
  const [isPublicProfile, setIsPublicProfile] = useState(profile.isPublicProfile)
  const kind = proKind(profile)
  // RL-042: what the account may hold — null for a grandfathered one.
  const vehicleCap = vehicleLimit(profile)
  // A one-off purchase never lapses, so it has no "if it ends".
  const isLifetime = profile.proPlan === 'LIFETIME' || profile.proPlan === 'PERSONAL_LIFETIME'
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
      setPortalError(data.error ?? t('portalFailed'))
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
      setPushStatus(t('pushEnabled'))
    } else if (result === 'denied') {
      setPushStatus(t('pushDenied'))
    } else if (result === 'unsupported') {
      setPushStatus(t('pushUnsupported'))
    } else {
      setPushStatus(t('pushNotConfigured'))
    }
  }

  async function onDeleteAccount() {
    if (!confirm(t('confirmDelete'))) return
    if (!confirm(t('confirmDeleteAgain'))) return
    setDeleting(true)
    setDeleteError(null)
    // Signing out only once the server says the account is gone: a refusal
    // (the last owner of an organisation others are in) must not look like
    // a deletion that happened.
    try {
      const res = await fetch('/api/me/account', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data.error ?? tc('networkError'))
        setDeleting(false)
        return
      }
    } catch {
      setDeleteError(tc('networkError'))
      setDeleting(false)
      return
    }
    await signOut({ callbackUrl: '/' })
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-6">
        <AvatarField userId={profile.id} initialUrl={profile.avatarUrl} />
        <div>
          <label className="label" htmlFor="displayName">{t('displayName')}</label>
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
          <label className="label" htmlFor="location">{t('location')}</label>
          <input
            id="location"
            name="location"
            className="input"
            placeholder={t('locationPlaceholder')}
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
          {t('makePublic')}
        </label>
        {saved && <p className="text-sm text-green-600 dark:text-green-400">{t('saved')}</p>}
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold text-ink">{t('plan')}</h2>
        {/* Describe what the person actually has. Someone on a comp gets
            Pro features but has no subscription, so they must not be shown
            a billing plan they never bought — nor nagged to upgrade. */}
        <p className="text-sm text-ink-muted">
          {kind === 'paid'
            ? profile.proPlan
              ? t(PLAN_KEYS[profile.proPlan])
              : t('planPaid')
            : kind === 'comped'
              ? t('planComped')
              : t('planFree')}{' '}
          —{' '}
          {kind === 'none'
            ? t('planFreeLimits', {
                vehicles: FREE_TIER.vehicles,
                photos: FREE_TIER.photosPerTask,
              })
            : vehicleCap === null
              ? t('planUncapped')
              : t('planPersonalLimits', { vehicles: vehicleCap })}
        </p>
        {kind === 'comped' && (
          <p className="mt-1 text-xs text-ink-faint">
            {profile.foundingNumber !== null
              ? t('foundingNote', { number: profile.foundingNumber })
              : t('compedNote')}
          </p>
        )}
        {allowance.readOnlyNow.length > 0 && (
          <p className="note-warn mt-3 rounded-lg p-3 text-sm">
            {t('readOnlyNow', { vehicles: allowance.readOnlyNow.join(', ') })}
          </p>
        )}
        {kind === 'paid' && !isLifetime && allowance.ifPlanEnds.length > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            {t('ifPlanEnds', { free: allowance.freeVehicles, vehicles: allowance.ifPlanEnds.join(', ') })}
          </p>
        )}
        {/* RL-042: choose which stay editable — now, when over the plan;
            otherwise, for a plan that can end, ahead of time. */}
        {allowance.readOnlyNow.length > 0 && vehicleCap !== null ? (
          <EditableVehiclesPicker
            endpoint="/api/me/editable-vehicles"
            max={vehicleCap}
            help={te('helpNow', { limit: vehicleCap })}
            vehicles={allowance.vehicles.map((v) => ({ id: v.id, label: v.label, chosen: v.editableNow }))}
          />
        ) : (
          kind === 'paid' &&
          !isLifetime &&
          allowance.ifPlanEnds.length > 0 && (
            <EditableVehiclesPicker
              endpoint="/api/me/editable-vehicles"
              max={allowance.freeVehicles}
              help={te('helpIfEnds', { limit: allowance.freeVehicles })}
              vehicles={allowance.vehicles.map((v) => ({ id: v.id, label: v.label, chosen: v.editableIfPlanEnds }))}
            />
          )
        )}
        {kind !== 'none' ? (
          kind === 'paid' && profile.stripeCustomerId && (
            <>
              <button type="button" className="btn-secondary mt-3" onClick={onManageBilling} disabled={portalLoading}>
                {portalLoading ? t('opening') : t('manageSubscription')}
              </button>
              {portalError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{portalError}</p>}
            </>
          )
        ) : (
          <Link href="/dashboard/upgrade" className="btn-primary mt-3 inline-block">
            {t('upgrade')}
          </Link>
        )}
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="mb-1 font-semibold text-ink">{t('followingTitle')}</h2>
        <p className="text-sm text-ink-muted">{t('followingHelp')}</p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={notifyFollowedEmail}
            onChange={(e) => {
              setNotifyFollowedEmail(e.target.checked)
              save({ notifyFollowedEmail: e.target.checked })
            }}
          />
          {t('emailMe')}
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
          {t('pushMe')}
        </label>
        <button type="button" className="btn-secondary" onClick={onEnablePush}>
          {t('enablePush')}
        </button>
        {pushStatus && <p className="text-sm text-ink-muted">{pushStatus}</p>}
      </div>

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-ink">{t('dangerZone')}</h2>
        <p className="mb-3 text-sm text-ink-muted">
          {t('deleteHelp')}
        </p>
        <button type="button" className="btn-danger" onClick={onDeleteAccount} disabled={deleting}>
          {deleting ? tc('deleting') : t('deleteAccount')}
        </button>
        {deleteError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
      </div>
    </div>
  )
}
