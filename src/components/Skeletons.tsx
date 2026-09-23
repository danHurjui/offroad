import { getTranslations } from 'next-intl/server'

/**
 * RL-034: the shape of a page while its Server Component streams, instead
 * of a blank area. Each is mounted by a `loading.tsx` scoped to exactly
 * one page (the `(garage)` and `(overview)` route groups exist for that —
 * a `loading.tsx` also covers every page nested below it, and a
 * garage-shaped placeholder on the settings page would be a lie).
 *
 * One status message for assistive tech per skeleton; the boxes
 * themselves are hidden from it.
 */

async function Loading({ children }: { children: React.ReactNode }) {
  const tc = await getTranslations('common')
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{tc('loading')}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

function Bar({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />
}

export async function GarageSkeleton() {
  return (
    <Loading>
      <div className="mb-6 flex items-center justify-between">
        <Bar className="h-8 w-48" />
        <Bar className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[16/9] rounded-none" />
            <div className="space-y-2 p-4">
              <Bar className="h-4 w-24" />
              <Bar className="h-5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  )
}

export async function VehicleSkeleton() {
  return (
    <Loading>
      <Bar className="mb-4 h-4 w-32" />
      <div className="mb-6 space-y-2">
        <Bar className="h-4 w-20" />
        <Bar className="h-8 w-56" />
        <Bar className="h-4 w-40" />
      </div>
      <div className="card mb-6 h-40" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-2 p-4">
            <Bar className="h-3 w-16" />
            <Bar className="h-5 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Bar className="mb-2 h-4 w-28" />
            <div className="card space-y-3 p-4">
              <Bar className="h-4 w-3/4" />
              <Bar className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  )
}

export async function AnalyticsSkeleton() {
  return (
    <Loading>
      <Bar className="mb-4 h-4 w-32" />
      <Bar className="mb-6 h-8 w-48" />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-2 p-4">
            <Bar className="h-3 w-20" />
            <Bar className="h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="card p-4">
        <Bar className="mb-4 h-4 w-40" />
        <Bar className="h-64 w-full" />
      </div>
    </Loading>
  )
}
