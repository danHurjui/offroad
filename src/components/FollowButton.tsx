'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// RL-023: follow/unfollow a public project. Logged-out visitors get a
// "log in to follow" prompt instead — following requires an account
// (notifications need somewhere to go).
export default function FollowButton({
  vehicleId,
  initialFollowing,
  initialFollowerCount,
}: {
  vehicleId: string
  initialFollowing: boolean
  initialFollowerCount: number
}) {
  const { status } = useSession()
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [count, setCount] = useState(initialFollowerCount)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/follow`, { method: following ? 'DELETE' : 'POST' })
    setLoading(false)
    if (!res.ok) return
    const data = await res.json()
    setFollowing(data.following)
    setCount(data.followerCount)
    router.refresh()
  }

  if (status === 'unauthenticated') {
    return (
      <Link href="/login" className="btn-secondary">
        Log in to follow · {count} {count === 1 ? 'follower' : 'followers'}
      </Link>
    )
  }

  return (
    <button type="button" className={following ? 'btn-secondary' : 'btn-primary'} onClick={toggle} disabled={loading}>
      {following ? 'Following' : 'Follow'} · {count} {count === 1 ? 'follower' : 'followers'}
    </button>
  )
}
