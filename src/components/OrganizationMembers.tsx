'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ORG_ROLES, type OrgRole } from '@/lib/organizations'
import { tryFetch } from '@/lib/writeFeedback'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

export type MemberRow = { id: string; displayName: string; email: string | null; role: OrgRole; isYou: boolean }

/**
 * RL-038: the members of an organisation. Owners change roles and remove
 * people; anyone can leave. The server refuses anything that would leave
 * the organisation without an owner, and its reason is what is shown.
 * Not optimistic: a refused change must not look like it happened first.
 */
export default function OrganizationMembers({
  organizationId,
  members,
  canManage,
}: {
  organizationId: string
  members: MemberRow[]
  canManage: boolean
}) {
  const t = useTranslations('organizations')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [busy, setBusy] = useState<string | null>(null)

  async function send(member: MemberRow, init: RequestInit, done: string, failed: string, after?: () => void) {
    setBusy(member.id)
    const res = await tryFetch(`/api/organizations/${organizationId}/members/${member.id}`, init)
    setBusy(null)
    if (!res?.ok) {
      toast.error(await reasonFor(res, failed))
      router.refresh()
      return
    }
    toast.success(done)
    if (after) after()
    else router.refresh()
  }

  function changeRole(member: MemberRow, role: OrgRole) {
    send(
      member,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) },
      t('roleChanged', { name: member.displayName }),
      t('roleChangeFailed')
    )
  }

  function remove(member: MemberRow) {
    if (!window.confirm(member.isYou ? t('confirmLeave') : t('confirmRemove', { name: member.displayName }))) return
    send(
      member,
      { method: 'DELETE' },
      member.isYou ? t('left') : t('removed', { name: member.displayName }),
      t('removeFailed'),
      member.isYou ? () => router.push('/dashboard/organizations') : undefined
    )
  }

  return (
    <ul className="card divide-y divide-surface-border">
      {members.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">
              {m.displayName}
              {m.isYou && <span className="ml-2 text-xs font-normal text-ink-faint">{t('you')}</span>}
            </div>
            {m.email && <div className="truncate text-xs text-ink-muted">{m.email}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <>
                <label className="sr-only" htmlFor={`role-${m.id}`}>{t('roleFor', { name: m.displayName })}</label>
                <select
                  id={`role-${m.id}`} className="input py-1 text-sm" value={m.role} disabled={busy === m.id}
                  onChange={(e) => changeRole(m, e.target.value as OrgRole)}
                >
                  {ORG_ROLES.map((r) => (
                    <option key={r} value={r}>{t(`role.${r}`)}</option>
                  ))}
                </select>
              </>
            ) : (
              <span className="badge bg-surface-subtle text-ink-muted">{t(`role.${m.role}`)}</span>
            )}
            {(canManage || m.isYou) && (
              <button type="button" className="btn-secondary py-1 text-xs" disabled={busy === m.id} onClick={() => remove(m)}>
                {m.isYou ? t('leave') : t('remove')}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
