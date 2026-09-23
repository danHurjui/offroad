'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import { useToast } from './Toaster'
import { useFailureReason, useOptimisticWrite } from './useOptimisticWrite'

type VoteState = { voted: boolean; count: number }

/**
 * Vote toggle.
 *
 * Optimistic only when `mayVote` — a signed-in account the
 * confirmed-address gate will let through. For anyone else the endpoint
 * answers 403, and a vote that appears and then vanishes is worse than a
 * plain refusal (RL-034), so it waits for the server instead.
 *
 * The server stays authoritative either way: one vote per user is a
 * database constraint, so the count it returns replaces the guess.
 */
export default function TicketVoteButton({
  ticketId,
  initialVoted,
  initialCount,
  signedIn,
  mayVote = signedIn,
  size = 'md',
}: {
  ticketId: string
  initialVoted: boolean
  initialCount: number
  signedIn: boolean
  mayVote?: boolean
  size?: 'sm' | 'md'
}) {
  const t = useTranslations('tickets')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [waiting, setWaiting] = useState(false)

  async function post(): Promise<{ ok: true; value: VoteState } | { ok: false; reason: string }> {
    const res = await tryFetch(`/api/tickets/${ticketId}/vote`, { method: 'POST' })
    if (!res?.ok) return { ok: false, reason: await reasonFor(res, t('voteFailed')) }
    const data = await res.json()
    return { ok: true, value: { voted: data.voted, count: data.voteCount } }
  }

  const { value, submit, busy } = useOptimisticWrite<VoteState>({
    serverValue: { voted: initialVoted, count: initialCount },
    fallbackError: t('voteFailed'),
    // The endpoint is a toggle, so what matters is whether the wanted
    // state differs from the server's — several taps that end where they
    // started send nothing further.
    equals: (a, b) => a.voted === b.voted,
    send: async (next, confirmed) => {
      if (next.voted === confirmed.voted) return { ok: true, value: confirmed }
      const result = await post()
      if (result.ok) router.refresh()
      return result
    },
  })

  async function toggle() {
    if (!signedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/tickets/${ticketId}`)}`)
      return
    }
    if (mayVote) {
      void submit({ voted: !value.voted, count: value.count + (value.voted ? -1 : 1) })
      return
    }
    // Pessimistic path: nothing moves until the server answers.
    if (waiting) return
    setWaiting(true)
    const result = await post()
    setWaiting(false)
    if (!result.ok) toast.error(result.reason)
    else router.refresh()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={waiting}
      aria-pressed={value.voted}
      aria-busy={busy || waiting}
      aria-label={value.voted ? t('unvote') : t('vote')}
      title={signedIn ? undefined : t('logInToVote')}
      className={`flex shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-colors disabled:opacity-60 ${
        size === 'sm' ? 'w-12 px-1 py-1.5' : 'w-14 px-2 py-2'
      } ${value.voted ? 'border-brand-500 bg-brand-50 dark:bg-brand-400/10 text-brand-700 dark:text-brand-200' : 'border-surface-border text-ink-muted hover:border-brand-300'}`}
    >
      <span aria-hidden className="text-xs leading-none">
        ▲
      </span>
      <span className={`font-semibold leading-tight ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{value.count}</span>
    </button>
  )
}
