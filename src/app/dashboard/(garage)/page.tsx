import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPES, isProjectType, type ProjectType } from '@/lib/projectType'
import { getAllVocabulary, getVocabulary } from '@/lib/vocabulary'
import VehicleCoverImg from '@/components/VehicleCoverImg'
import { PlateBadge } from '@/components/VehicleIdentity'
import { matchesVehicleSearch } from '@/lib/vehicleProfile'
import FirstVehicleChecklist, { type ChecklistStep } from '@/components/FirstVehicleChecklist'
import { hasPro, PRO_SELECT } from '@/lib/pro'
import { isGarageSort, sortGarage, summarizeGarage, type GarageCard, type GarageSort } from '@/lib/garage'
import GarageLayout from '@/components/GarageLayout'
import { toNumberOrNull } from '@/lib/serialize'
import {
  closeOnboarding,
  loadOnboardingCounts,
  onboardingState,
  shouldShowChecklist,
  type OnboardingStep,
} from '@/lib/onboarding'

type GarageParams = { q?: string; mode?: string; attention?: string; sort?: string }

const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })
const DOC_CLASS = { valid: 'badge-success', expiring: 'badge-warn', expired: 'badge-danger' } as const

export default async function DashboardPage({ searchParams }: { searchParams: GarageParams }) {
  const t = await getTranslations('dashboard')
  const ta = await getTranslations('analytics')
  const session = await requireSessionOrRedirect()

  const [owned, collaborating, user] = await Promise.all([
    prisma.vehicle.findMany({ where: { ownerId: session.user.id }, orderBy: { updatedAt: 'desc' } }),
    prisma.vehicle.findMany({
      where: { collaborators: { some: { collaboratorUserId: session.user.id, status: 'ACTIVE' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT, onboardingClosedAt: true } }),
  ])

  const atFreeLimit = !hasPro(user) && owned.length >= 1
  const tp = await getTranslations('vehicleProfile')
  const query = (searchParams.q ?? '').slice(0, 60)
  const mode = isProjectType(searchParams.mode) ? searchParams.mode : null
  const attentionOnly = searchParams.attention === '1'
  const sort: GarageSort = isGarageSort(searchParams.sort) ? searchParams.sort : 'activity'
  const checklist = await checklistSteps(session.user.id, user?.onboardingClosedAt ?? null, owned, collaborating.length)

  // RL-035: two batched queries for every card on the page, not one per
  // vehicle. Documents only for owned vehicles — the documents screen is
  // the owner's, so a collaborator's card never shows an expiry.
  const all = [...owned, ...collaborating]
  const [tasks, documents] = all.length
    ? await Promise.all([
        prisma.task.findMany({
          where: { vehicleId: { in: all.map((v) => v.id) } },
          select: { vehicleId: true, status: true, category: true, workType: true, costRon: true, partsCostRon: true, labourCostRon: true, date: true, updatedAt: true },
        }),
        owned.length
          ? prisma.document.findMany({ where: { vehicleId: { in: owned.map((v) => v.id) } }, select: { vehicleId: true, type: true, expiryDate: true } })
          : Promise.resolve([]),
      ])
    : [[], []]
  const taskRows = tasks.map((task) => ({
    ...task,
    costRon: toNumberOrNull(task.costRon),
    partsCostRon: toNumberOrNull(task.partsCostRon),
    labourCostRon: toNumberOrNull(task.labourCostRon),
  }))
  const cards = new Map(summarizeGarage(all, taskRows, documents, session.user.id).map((c) => [c.vehicleId, c]))
  const shown = sortGarage(
    all
      .filter((v) => matchesVehicleSearch(v, query))
      .filter((v) => !mode || v.projectType === mode)
      .map((v) => ({ vehicle: v, card: cards.get(v.id)!, name: `${v.make} ${v.model} ${v.year}` }))
      .filter((item) => !attentionOnly || item.card.attention.length > 0),
    sort
  )
  const modesPresent = PROJECT_TYPES.filter((type) => all.some((v) => v.projectType === type))
  const filtering = Boolean(query || mode || attentionOnly || searchParams.sort)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {owned.length > 0 && (
            <Link href="/dashboard/analytics" className="btn-secondary">
              {ta('viewGarageSpend')}
            </Link>
          )}
        {atFreeLimit ? (
          <span className="badge bg-surface-subtle text-ink-muted" title={t('freeLimitTitle')}>
            {t('freeLimitBadge')}
          </span>
        ) : (
          <Link href="/dashboard/vehicles/new" className="btn-primary">
            {t('addVehicle')}
          </Link>
        )}
        </div>
      </div>

      {checklist && <FirstVehicleChecklist steps={checklist} />}

      {owned.length === 0 && collaborating.length === 0 ? (
        <EmptyGarage />
      ) : (
        <>
          {/* RL-050/RL-035: find, filter and sort once there is more than
              one vehicle to choose between; `/` focuses the search. */}
          {(all.length > 1 || filtering) && (
            <GarageControls query={query} mode={mode} attentionOnly={attentionOnly} sort={sort} modes={modesPresent} filtering={filtering} />
          )}
          {shown.length === 0 ? (
            <p className="card p-6 text-center text-ink-muted">{query ? tp('searchNone', { q: query }) : t('garage.noneMatch')}</p>
          ) : (
            <GarageLayout>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 group-data-[density=compact]/garage:gap-2 sm:group-data-[density=compact]/garage:grid-cols-1">
                {shown.map(({ vehicle, card }) => (
                  <li key={vehicle.id} className="min-w-0">
                    <VehicleCard vehicle={vehicle} card={card} />
                  </li>
                ))}
              </ul>
            </GarageLayout>
          )}
        </>
      )}
    </div>
  )
}

/**
 * RL-036: the checklist's steps with somewhere to go for each, or null
 * when it no longer belongs on this dashboard. Every step after the first
 * links into the most recently updated owned vehicle — for a beginner,
 * the only one.
 */
async function checklistSteps(
  userId: string,
  closedAt: Date | null,
  owned: { id: string }[],
  collaborating: number
): Promise<ChecklistStep[] | null> {
  if (!shouldShowChecklist({ closedAt, ownedVehicles: owned.length, collaboratingVehicles: collaborating })) {
    return null
  }

  const state = onboardingState(await loadOnboardingCounts(userId, owned.length))
  if (state.complete) {
    // Finished: close it for good rather than recomputing it on every
    // visit, so deleting a vehicle later cannot bring it back. Best
    // effort — failing to record that must not break the dashboard.
    await closeOnboarding(userId).catch((e) => console.error('[onboarding] could not close the checklist', e))
    return null
  }

  const first = owned[0]?.id
  const hrefs: Record<OnboardingStep, string | null> = {
    vehicle: '/dashboard/vehicles/new',
    task: first ? `/dashboard/vehicles/${first}/tasks/new` : null,
    photo: first ? `/dashboard/vehicles/${first}/photos` : null,
    document: first ? `/dashboard/vehicles/${first}/documents` : null,
  }
  return state.steps.map((step) => ({ ...step, href: hrefs[step.id] }))
}

/**
 * RL-036: a new account's first screen. The one decision that cannot be
 * undone — the mode — is explained here in a sentence each, read from
 * PROJECT_TYPE_CONFIG through the vocabulary so it cannot drift from what
 * the create form offers. Each mode links straight into the form with
 * that mode picked.
 */
async function EmptyGarage() {
  const t = await getTranslations('dashboard')
  const vocabulary = await getAllVocabulary()
  return (
    <div className="card p-6 sm:p-10">
      <h2 className="mb-2 text-xl font-semibold text-ink">{t('emptyTitle')}</h2>
      <p className="mb-4 text-ink-muted">{t('emptyBody')}</p>
      <ul className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROJECT_TYPES.map((type) => (
          <li key={type} className="min-w-0">
            <Link
              href={`/dashboard/vehicles/new?type=${type}`}
              className="block h-full rounded-xl border-2 border-surface-border p-4 hover:border-brand-500"
            >
              <span className="block font-semibold text-ink">{vocabulary[type].label}</span>
              <span className="block text-sm text-ink-muted">{vocabulary[type].description}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mb-6 text-sm text-ink-muted">{t('emptyModeFixed')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/vehicles/new" className="btn-primary">
          {t('addVehicle')}
        </Link>
        <Link href="/demo#modes" className="text-sm text-brand-600 hover:underline dark:text-brand-300">
          {t('emptyDemo')}
        </Link>
      </div>
    </div>
  )
}

const compact = {
  hide: 'group-data-[density=compact]/garage:hidden',
  row: 'group-data-[density=compact]/garage:flex group-data-[density=compact]/garage:flex-wrap group-data-[density=compact]/garage:items-center group-data-[density=compact]/garage:gap-x-4 group-data-[density=compact]/garage:gap-y-1 group-data-[density=compact]/garage:py-3',
}

/**
 * RL-035: one vehicle, readable without opening it. The same markup is the
 * card and the compact row; GarageLayout's `data-density` decides which.
 */
async function VehicleCard({
  vehicle,
  card,
}: {
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    projectType: ProjectType
    coverPhotoUrl: string | null
    plate: string | null
  }
  card: GarageCard
}) {
  const t = await getTranslations('dashboard')
  const th = await getTranslations('health')
  const config = await getVocabulary(vehicle.projectType)
  const doc = card.soonestDocument
  const docKey = doc && ({ valid: 'garage.docValid', expiring: 'garage.docExpiring', expired: 'garage.docExpired' } as const)[doc.status]
  return (
    <Link href={`/dashboard/vehicles/${vehicle.id}`} className="card block h-full overflow-hidden hover:shadow-panel">
      <div className={compact.hide}>
        <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={`${vehicle.make} ${vehicle.model}`} />
      </div>
      <div className={`space-y-2 p-4 group-data-[density=compact]/garage:space-y-0 ${compact.row}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-brand">{config.label}</span>
          {!card.isOwner && <span className="badge bg-surface-subtle text-ink-muted">{t('collaborator')}</span>}
          {card.attention.length > 0 && (
            <span
              className="badge badge-danger"
              title={card.attention.map((a) => t(a === 'document' ? 'garage.attentionDocument' : 'garage.attentionJob')).join(' · ')}
            >
              {t('garage.attention')}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="break-words font-semibold text-ink">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h2>
          {vehicle.plate && (
            <div className={`mt-1 ${compact.hide}`}>
              <PlateBadge plate={vehicle.plate} />
            </div>
          )}
        </div>
        <div className="min-w-0 text-sm text-ink-muted">
          {card.figure.kind === 'progress' ? t('garage.progress', { pct: card.figure.pct }) : t('garage.openJobs', { count: card.figure.count })}
          {card.figure.kind === 'progress' && (
            <div className={`mt-1 h-1.5 overflow-hidden rounded-full bg-surface-subtle ${compact.hide}`} aria-hidden="true">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${card.figure.pct}%` }} />
            </div>
          )}
        </div>
        {card.isOwner && (
          <div className="min-w-0 text-sm">
            {doc && docKey ? (
              <span className={`badge ${DOC_CLASS[doc.status]} whitespace-normal`}>{t(docKey, { doc: th(`doc.${doc.type}`), date: fmtDate(doc.expiryDate) })}</span>
            ) : (
              <span className="text-ink-faint">{t('garage.noDocuments')}</span>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap gap-x-3 text-xs text-ink-faint">
          {card.spend !== null && <span>{t('garage.spent', { amount: card.spend.toLocaleString('ro-RO', { maximumFractionDigits: 2 }) })}</span>}
          <span>{t('garage.lastActivity', { date: fmtDate(card.lastActivity) })}</span>
        </div>
      </div>
    </Link>
  )
}

/**
 * A plain GET form: works without script, and the result is a shareable
 * URL. Search (RL-050) plus mode, needs-attention and sort (RL-035).
 */
async function GarageControls({
  query,
  mode,
  attentionOnly,
  sort,
  modes,
  filtering,
}: {
  query: string
  mode: ProjectType | null
  attentionOnly: boolean
  sort: GarageSort
  modes: ProjectType[]
  filtering: boolean
}) {
  const t = await getTranslations('vehicleProfile')
  const tg = await getTranslations('dashboard.garage')
  const vocabulary = await getAllVocabulary()
  return (
    <form role="search" action="/dashboard" className="card mb-4 space-y-3 p-3">
      <div className="flex gap-2">
        <label htmlFor="garage-search" className="sr-only">{t('searchLabel')}</label>
        <input
          id="garage-search"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          className="input min-w-0 flex-1"
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        {modes.length > 1 ? (
          <div className="min-w-0">
            <label htmlFor="garage-mode" className="label">{tg('filterMode')}</label>
            <select id="garage-mode" name="mode" defaultValue={mode ?? ''} className="input">
              <option value="">{tg('allModes')}</option>
              {modes.map((type) => (
                <option key={type} value={type}>{vocabulary[type].label}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="min-w-0">
          <label htmlFor="garage-sort" className="label">{tg('sort')}</label>
          <select id="garage-sort" name="sort" defaultValue={sort} className="input">
            <option value="activity">{tg('sortActivity')}</option>
            <option value="attention">{tg('sortAttention')}</option>
            <option value="name">{tg('sortName')}</option>
          </select>
        </div>
        <label className="flex min-w-0 items-center gap-2 text-sm text-ink sm:pb-2">
          <input type="checkbox" name="attention" value="1" defaultChecked={attentionOnly} />
          {tg('filterAttention')}
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary">{tg('apply')}</button>
        {filtering && (
          <Link href="/dashboard" className="btn-secondary">
            {tg('clear')}
          </Link>
        )}
      </div>
    </form>
  )
}
