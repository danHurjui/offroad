'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ORG_ROLES, type OrgRole } from '@/lib/organizations'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

export type InviteRow = { id: string; email: string; role: OrgRole; status: 'pending' | 'expired'; invitedAt: string }

/**
 * RL-038: invite people to an organisation (owners), and the invitations
 * still open — pending or expired — with resend and withdraw. Withdrawing
 * is confirmed rather than undoable: it is a single field, and the owner
 * can simply invite again.
 */
export default function OrganizationInvites({ organizationId, invites }: { organizationId: string; invites: InviteRow[] }) {
  const t = useTranslations('organizations')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('DRIVER')
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/organizations/${organizationId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('inviteFailed')))
      return
    }
    toast.success(t('invited', { email: email.trim() }))
    setEmail('')
    router.refresh()
  }

  async function act(invite: InviteRow, kind: 'resend' | 'withdraw') {
    if (kind === 'withdraw' && !window.confirm(t('confirmWithdraw', { email: invite.email }))) return
    setRowBusy(invite.id)
    const res = await tryFetch(
      `/api/organizations/${organizationId}/invites/${invite.id}${kind === 'resend' ? '/resend' : ''}`,
      { method: kind === 'resend' ? 'POST' : 'DELETE' }
    )
    setRowBusy(null)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t(kind === 'resend' ? 'resendFailed' : 'withdrawFailed')))
      return
    }
    toast.success(t(kind === 'resend' ? 'resent' : 'withdrawn', { email: invite.email }))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onInvite} className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-ink">{t('inviteTitle')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <label className="label" htmlFor="org-invite-email">{t('inviteEmail')}</label>
            <input
              id="org-invite-email" type="email" required className="input" autoComplete="off" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="org-invite-error"
            />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="org-invite-role">{t('inviteRole')}</label>
            <select id="org-invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>{t(`role.${r}`)}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-ink-faint">{t('inviteHelp')}</p>
        <FormError id="org-invite-error">{error}</FormError>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? t('inviting') : t('invite')}
        </button>
      </form>

      {invites.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('invitesTitle')}</h2>
          <ul className="card divide-y divide-surface-border">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{i.email}</div>
                  <div className="text-xs text-ink-muted">
                    {t(`role.${i.role}`)} · {i.status === 'expired' ? t('inviteExpired') : t('invitePending', { date: new Date(i.invitedAt).toLocaleDateString('ro-RO') })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary py-1 text-xs" disabled={rowBusy === i.id} onClick={() => act(i, 'resend')}>
                    {t('resend')}
                  </button>
                  <button type="button" className="btn-secondary py-1 text-xs" disabled={rowBusy === i.id} onClick={() => act(i, 'withdraw')}>
                    {t('withdraw')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
