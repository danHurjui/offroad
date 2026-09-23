import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { accessForRole } from '@/lib/access'
import { daysUntilMessage } from '@/lib/documents'
import { complianceBoard, FLEET_DOCUMENT_TYPES, type FleetCell } from '@/lib/fleet'

const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })
const CELL_CLASS = { valid: 'badge-success', expiring: 'badge-warn', expired: 'badge-danger' } as const

type Params = { params: { orgId: string }; searchParams: { vehicle?: string } }

// RL-039: the fleet's compliance board. For the people who manage the
// organisation's vehicles (OWNER, FLEET_MANAGER); a 404 for anyone else.
// Every vehicle, never a page of them: a fleet board with a partial answer
// is worse than none, so it is two queries over the whole organisation.
export default async function FleetPage({ params, searchParams }: Params) {
  const t = await getTranslations('fleet')
  const to = await getTranslations('organizations')
  const th = await getTranslations('health')
  const td = await getTranslations('documents')
  const tc = await getTranslations('common')
  const tr = await getTranslations('fleetReport')
  const session = await requireSessionOrRedirect()
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.orgId, userId: session.user.id } },
    include: { organization: { select: { id: true, name: true } } },
  })
  if (!membership || accessForRole(membership.role) !== 'owner') notFound()
  const org = membership.organization

  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: org.id },
    select: { id: true, year: true, make: true, model: true, plate: true },
    orderBy: { createdAt: 'asc' },
  })
  const selected = vehicles.find((v) => v.id === searchParams.vehicle) ?? null
  const shown = selected ? [selected] : vehicles
  const documents = shown.length
    ? await prisma.document.findMany({
        where: { vehicleId: { in: shown.map((v) => v.id) } },
        select: { vehicleId: true, type: true, expiryDate: true },
      })
    : []
  const board = complianceBoard(shown, documents)

  const cell = (c: FleetCell) => {
    if (!c) return <span className="text-xs text-ink-faint">{t('none')}</span>
    const message = daysUntilMessage(c.daysUntil)
    return (
      <span className={`badge ${CELL_CLASS[c.status]}`} title={`${td(message.key, message.values)} · ${fmtDate(c.expiryDate)}`}>
        {t('days', { days: c.daysUntil })}
      </span>
    )
  }

  return (
    <div>
      <Link href={`/dashboard/organizations/${org.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: org.name })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-3 text-sm text-ink-muted">{t('intro')}</p>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={`/dashboard/organizations/${org.id}/fleet/costs`} className="btn-secondary">
          {t('cost.open')}
        </Link>
        <Link href={`/dashboard/organizations/${org.id}/fleet/reports`} className="btn-secondary">
          {tr('open')}
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={`card p-4 ${board.totals.offRoad > 0 ? 'note-danger' : ''}`}>
          <div className="text-xs uppercase tracking-wide text-ink-faint">{t('offRoad')}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{board.totals.offRoad}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{t('expiring')}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{board.totals.expiring}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{t('missing')}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{board.totals.missingItpOrRca}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{t('vehicles')}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{board.totals.vehicles}</div>
        </div>
      </div>

      {vehicles.length > 1 && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-0">
            <label className="label" htmlFor="fleet-vehicle">{t('filterVehicle')}</label>
            <select id="fleet-vehicle" name="vehicle" className="input" defaultValue={selected?.id ?? ''}>
              <option value="">{t('allVehicles')}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate ? `${v.plate} · ` : ''}{v.year} {v.make} {v.model}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">{t('apply')}</button>
        </form>
      )}

      {board.rows.length === 0 ? (
        <p className="card p-4 text-sm text-ink-faint">{to('noVehicles')}</p>
      ) : (
        // The page never scrolls sideways; the table does, inside its card.
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="p-3">{t('vehicle')}</th>
                {FLEET_DOCUMENT_TYPES.map((type) => (
                  <th key={type} scope="col" className="p-3">{th(`doc.${type}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {board.rows.map((row) => (
                <tr key={row.vehicle.id} className={row.expired.length > 0 ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                  <th scope="row" className="p-3 text-left font-normal">
                    <Link href={`/dashboard/vehicles/${row.vehicle.id}/documents`} className="font-medium text-ink hover:underline">
                      {row.vehicle.plate ?? `${row.vehicle.make} ${row.vehicle.model}`}
                    </Link>
                    <div className="text-xs text-ink-muted">
                      {row.vehicle.year} {row.vehicle.make} {row.vehicle.model}
                      {row.historic && <span className="ml-1">· {t('historic')}</span>}
                    </div>
                    {row.expired.length > 0 && <span className="badge badge-danger mt-1">{t('offRoadBadge')}</span>}
                  </th>
                  {FLEET_DOCUMENT_TYPES.map((type) => (
                    <td key={type} className="p-3">{cell(row.cells[type])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-faint">{t('footnote')}</p>
    </div>
  )
}
