import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import AdminUserActiveToggle from '@/components/AdminUserActiveToggle'
import AdminCompProToggle from '@/components/AdminCompProToggle'

export const metadata: Metadata = { title: 'Users — RigLog admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string }
}) {
  const session = await requireAdminOrNotFound()
  const q = searchParams.q?.trim() ?? ''
  const status = searchParams.status === 'active' || searchParams.status === 'inactive' ? searchParams.status : undefined
  const page = Math.max(1, Number(searchParams.page) || 1)

  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { username: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(status === 'active' ? { active: true } : status === 'inactive' ? { active: false } : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, email: true, displayName: true, username: true,
        isPro: true, isProComped: true, foundingNumber: true, isAdmin: true, active: true, createdAt: true,
        _count: { select: { vehicles: true, tickets: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status) p.set('status', status)
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v)
    }
    const out = p.toString()
    return out ? `/admin/users?${out}` : '/admin/users'
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Users</h1>
        <span className="text-sm text-ink-muted">{total} total</span>
      </div>

      <form className="card mb-4 flex flex-wrap gap-3 p-4" method="get">
        <input
          type="text" name="q" defaultValue={q} placeholder="Search email, name or username…"
          className="input flex-1 min-w-48"
        />
        <select name="status" defaultValue={status ?? ''} className="input w-40">
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>
        <button type="submit" className="btn-primary">Search</button>
        {(q || status) && <Link href="/admin/users" className="btn-secondary">Clear</Link>}
      </form>

      {users.length === 0 ? (
        <p className="card p-8 text-center text-ink-muted">No users match that search.</p>
      ) : (
        <div className="card divide-y divide-surface-border">
          {users.map((u) => {
            // The API enforces both of these too; this only explains why the
            // button is missing instead of letting it fail on click.
            const reason =
              u.id === session.user.id
                ? 'This is you'
                : u.isAdmin
                  ? 'Admin — change in the database'
                  : undefined
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-ink hover:text-brand-600 dark:hover:text-brand-300">
                      {u.displayName}
                    </Link>
                    {u.isAdmin && <span className="badge badge-warn">admin</span>}
                    {u.isPro && <span className="badge badge-brand">Pro</span>}
                    {u.isProComped && (
                      <span className="badge badge-success">
                        {u.foundingNumber !== null ? `Founding #${u.foundingNumber}` : 'Pro · comped'}
                      </span>
                    )}
                    {!u.active && <span className="badge badge-danger">deactivated</span>}
                  </div>
                  <div className="truncate text-sm text-ink-muted">{u.email}</div>
                  <div className="text-xs text-ink-faint">
                    joined {new Date(u.createdAt).toLocaleDateString('ro-RO')} ·{' '}
                    {u._count.vehicles} vehicle{u._count.vehicles === 1 ? '' : 's'} ·{' '}
                    {u._count.tickets} ticket{u._count.tickets === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
                  <AdminCompProToggle
                    userId={u.id} displayName={u.displayName} isProComped={u.isProComped} isPro={u.isPro}
                  />
                  <AdminUserActiveToggle
                    userId={u.id} displayName={u.displayName} active={u.active} disabledReason={reason}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="btn-secondary">← Previous</Link> : <span />}
          <span className="text-ink-muted">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={qs({ page: String(page + 1) })} className="btn-secondary">Next →</Link> : <span />}
        </div>
      )}
    </div>
  )
}
