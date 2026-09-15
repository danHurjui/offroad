import Link from 'next/link'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, type ProjectType } from '@/lib/projectType'
import { computeVehicleProgress } from '@/lib/vehicleProgress'
import { ERA_OPTIONS, yearMatchesEra } from '@/lib/era'

export const metadata: Metadata = {
  title: 'Community builds — RigLog',
  description: 'Browse public off-road builds and restoration projects on RigLog.',
}

const PAGE_SIZE = 20
// Community-scale cap: this computes progress/status per vehicle in
// memory (see the comment below), so it fetches a bounded batch of
// matching vehicles rather than the whole table. Fine at this app's
// current scale; would need a stored/materialized status field (and real
// DB-level pagination) well before this cap becomes limiting.
const FETCH_CAP = 300

interface SearchParams {
  type?: string
  make?: string
  country?: string
  status?: string
  era?: string
  q?: string
  page?: string
  following?: string
}

export default async function CommunityFeedPage({ searchParams }: { searchParams: SearchParams }) {
  const type = searchParams.type === 'OFFROAD' || searchParams.type === 'RESTORATION' ? searchParams.type : undefined
  const make = searchParams.make?.trim() ?? ''
  const country = searchParams.country?.trim() ?? ''
  const status = searchParams.status === 'complete' || searchParams.status === 'in_progress' ? searchParams.status : undefined
  const era = searchParams.era ?? ''
  const q = searchParams.q?.trim() ?? ''
  const page = Math.max(1, Number(searchParams.page) || 1)

  const session = await getServerSession(authOptions)
  // RL-023: "Following" tab — only meaningful when logged in; falls back
  // to the full feed for a logged-out visitor rather than erroring.
  const followingOnly = searchParams.following === '1' && Boolean(session)

  const where = {
    isPublic: true,
    ...(type ? { projectType: type as ProjectType } : {}),
    ...(make ? { make: { contains: make, mode: 'insensitive' as const } } : {}),
    ...(country ? { owner: { location: { contains: country, mode: 'insensitive' as const } } } : {}),
    ...(followingOnly ? { followers: { some: { followerUserId: session!.user.id } } } : {}),
    ...(q
      ? {
          OR: [
            { make: { contains: q, mode: 'insensitive' as const } },
            { model: { contains: q, mode: 'insensitive' as const } },
            { owner: { displayName: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: FETCH_CAP,
    include: {
      owner: { select: { username: true, displayName: true, location: true } },
      tasks: { select: { status: true, category: true } },
    },
  })

  const withComputedFields = vehicles
    .filter((v) => v.owner.username && v.slug) // always true for a public vehicle post-RL-018, but stay defensive
    .map((v) => {
      const config = PROJECT_TYPE_CONFIG[v.projectType]
      const { isComplete } = computeVehicleProgress(v.tasks, config.categories.length, config.completeStatus)
      return { vehicle: v, config, isComplete, taskCount: v.tasks.length }
    })
    .filter((v) => {
      if (status === 'complete' && !v.isComplete) return false
      if (status === 'in_progress' && v.isComplete) return false
      if (era && v.vehicle.projectType === 'RESTORATION' && !yearMatchesEra(v.vehicle.year, era)) return false
      return true
    })

  const total = withComputedFields.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageItems = withComputedFields.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function buildHref(overrides: Partial<SearchParams>) {
    const merged = { type, make, country, status, era, q, following: followingOnly ? '1' : undefined, ...overrides }
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, String(value))
    }
    const qs = params.toString()
    return qs ? `/community?${qs}` : '/community'
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-ink">Community builds</h1>
            <p className="text-sm text-ink-muted">Public off-road builds and restoration projects on RigLog.</p>
          </div>
          <Link href="/community/parts-wanted" className="btn-secondary shrink-0">
            Parts wanted
          </Link>
        </div>

        {session && (
          <div className="mb-4 flex gap-2 text-sm">
            <Link href={buildHref({ following: undefined, page: undefined })} className={`badge ${!followingOnly ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
              All
            </Link>
            <Link href={buildHref({ following: '1', page: undefined })} className={`badge ${followingOnly ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
              Following
            </Link>
          </div>
        )}

        <form className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6" method="get">
          {followingOnly && <input type="hidden" name="following" value="1" />}
          <input type="text" name="q" defaultValue={q} placeholder="Search make, model, owner…" className="input sm:col-span-3 lg:col-span-2" />
          <select name="type" defaultValue={type ?? ''} className="input">
            <option value="">All types</option>
            <option value="OFFROAD">Off-road</option>
            <option value="RESTORATION">Restoration</option>
          </select>
          <input type="text" name="make" defaultValue={make} placeholder="Make" className="input" />
          <input type="text" name="country" defaultValue={country} placeholder="Country / location" className="input" />
          <select name="status" defaultValue={status ?? ''} className="input">
            <option value="">Any status</option>
            <option value="in_progress">In progress</option>
            <option value="complete">Complete</option>
          </select>
          <select name="era" defaultValue={era} className="input" title="Restoration projects only">
            <option value="">Any era (restoration)</option>
            {ERA_OPTIONS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary sm:col-span-3 lg:col-span-1">
            Filter
          </button>
        </form>

        {pageItems.length === 0 ? (
          <p className="text-center text-sm text-ink-faint">
            {followingOnly ? "You're not following any public projects yet." : 'No public builds match these filters yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map(({ vehicle, config, taskCount }) => (
              <Link
                key={vehicle.id}
                href={`/builds/${vehicle.owner.username}/${vehicle.slug}`}
                className="card block overflow-hidden hover:shadow-md"
              >
                {vehicle.coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/uploads/${vehicle.coverPhotoUrl}`}
                    alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-surface-subtle text-sm text-ink-faint">
                    No cover photo
                  </div>
                )}
                <div className="p-4">
                  <span className="badge bg-brand-100 text-brand-700">{config.label}</span>
                  <h2 className="mt-2 font-semibold text-ink">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </h2>
                  <p className="text-xs text-ink-faint">
                    {taskCount} {taskCount === 1 ? 'task' : 'tasks'} · updated {vehicle.updatedAt.toLocaleDateString('ro-RO')}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {vehicle.owner.displayName}
                    {vehicle.owner.location ? ` · ${vehicle.owner.location}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm">
            {page > 1 && (
              <Link href={buildHref({ page: String(page - 1) })} className="btn-secondary">
                ← Previous
              </Link>
            )}
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={buildHref({ page: String(page + 1) })} className="btn-secondary">
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
