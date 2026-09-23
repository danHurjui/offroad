'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { tryFetch } from '@/lib/writeFeedback'
import { useFailureReason, useOptimisticWrite } from './useOptimisticWrite'

type FollowState = { following: boolean; count: number }

// RL-023: follow/unfollow a public project. Logged-out visitors get a
// "log in to follow" prompt instead — following requires an account
// (notifications need somewhere to go).
//
// RL-034: optimistic. Following has no Pro or confirmed-address gate, so
// the only refusals it can meet are failures, which roll back with the
// server's reason. POST and DELETE are idempotent, so the latest-wins
// writer can send the final state however many times it was tapped.
export default function FollowButton({
  vehicleId,
  initialFollowing,
  initialFollowerCount,
}: {
  vehicleId: string
  initialFollowing: boolean
  initialFollowerCount: number
}) {
  const t = useTranslations('follow')
  const { status } = useSession()
  const router = useRouter()
  const reasonFor = useFailureReason()

  const { value, submit, busy } = useOptimisticWrite<FollowState>({
    serverValue: { following: initialFollowing, count: initialFollowerCount },
    fallbackError: t('failed'),
    equals: (a, b) => a.following === b.following,
    send: async (next) => {
      const res = await tryFetch(`/api/vehicles/${vehicleId}/follow`, { method: next.following ? 'POST' : 'DELETE' })
      if (!res?.ok) return { ok: false, reason: await reasonFor(res, t('failed')) }
      const data = await res.json()
      router.refresh()
      return { ok: true, value: { following: data.following, count: data.followerCount } }
    },
  })

  const followers = t('followers', { count: value.count })

  if (status === 'unauthenticated') {
    return (
      <Link href="/login" className="btn-secondary">
        {t('logInToFollow')} · {followers}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={value.following ? 'btn-secondary' : 'btn-primary'}
      onClick={() => submit({ following: !value.following, count: value.count + (value.following ? -1 : 1) })}
      aria-pressed={value.following}
      aria-busy={busy}
    >
      {value.following ? t('following') : t('follow')} · {followers}
    </button>
  )
}
