'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { statusBadgeClass, type ProjectType } from '@/lib/projectType'
import { useVocabulary } from '@/lib/vocabulary'
import { tryFetch } from '@/lib/writeFeedback'
import { useFailureReason, useOptimisticWrite } from './useOptimisticWrite'

/**
 * RL-034: change a task's status where it is shown, instead of through
 * the full edit form. Optimistic — the badge changes on selection and
 * goes back, with the server's reason, if the write is refused.
 *
 * Only rendered for someone the PATCH route will accept (the owner, or
 * the collaborator who added the task), so the refusal it can meet is a
 * failure, not a gate — see src/lib/writeFeedback.ts.
 */
export default function TaskStatusControl({
  vehicleId,
  taskId,
  projectType,
  status,
}: {
  vehicleId: string
  taskId: string
  projectType: ProjectType
  status: string
}) {
  const t = useTranslations('task')
  const router = useRouter()
  const config = useVocabulary(projectType)
  const reasonFor = useFailureReason()

  const { value, submit } = useOptimisticWrite<string>({
    serverValue: status,
    fallbackError: t('statusFailed'),
    send: async (next) => {
      const res = await tryFetch(`/api/vehicles/${vehicleId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res?.ok) return { ok: false, reason: await reasonFor(res, t('statusFailed')) }
      // Progress, the completed count and the follower notification all
      // hang off status; the rest of the page catches up behind the badge.
      router.refresh()
      return { ok: true }
    },
  })

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{t('statusLabel')}</span>
      <select
        value={value}
        onChange={(e) => submit(e.target.value)}
        className={`${statusBadgeClass(config.statusTags, value)} cursor-pointer border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}
      >
        {config.statusTags.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
