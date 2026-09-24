import Link from 'next/link'
import { HideWhilePending } from '@/components/Toaster'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { labelFor, statusBadgeClass } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import { getDocumentStatus, isHistoricVehicle } from '@/lib/documents'
import { computeOriginalityScore } from '@/lib/originality'
import VehicleCoverImg from '@/components/VehicleCoverImg'
import OriginalityBadge from '@/components/OriginalityBadge'
import { PlateBadge, RegistrationSummary } from '@/components/VehicleIdentity'
import OdometerQuickAdd from '@/components/OdometerQuickAdd'
import VehicleHealthPanel from '@/components/VehicleHealthPanel'
import { computeHealth } from '@/lib/vehicleHealth'
import DriverPanel from '@/components/DriverPanel'
import ReadOnlyVehicleNotice from '@/components/ReadOnlyVehicleNotice'
import { vehicleHasPro } from '@/lib/entitlement'
import { formatRon } from '@/lib/money'

// RL-003: project dashboard — build overview screen.
export default async function VehicleDashboardPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('vehicle')
  const tc = await getTranslations('common')
  const td = await getTranslations('dashboard')
  const tCover = await getTranslations('cover')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const isOwner = vehicle.access === 'owner'
  const config = await getVocabulary(vehicle.projectType)
  const completeStatus = config.completeStatus

  const [tasks, foundState, documents, collaborators, latestReading, readings, tyreSets] = await Promise.all([
    prisma.task.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { updatedAt: 'desc' },
      include: { addedBy: { select: { displayName: true } } },
    }),
    vehicle.projectType === 'RESTORATION'
      ? prisma.foundState.findUnique({ where: { vehicleId: vehicle.id } })
      : Promise.resolve(null),
    prisma.document.findMany({ where: { vehicleId: vehicle.id }, select: { id: true, type: true, expiryDate: true } }),
    prisma.projectCollaborator.findMany({
      where: { vehicleId: vehicle.id },
      select: { collaboratorUserId: true, status: true },
    }),
    // RL-044: the current mileage is the newest reading — derived here,
    // never stored on the vehicle. Same order as currentReading().
    prisma.odometerReading.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: [{ readAt: 'desc' }, { createdAt: 'desc' }],
      select: { km: true, readAt: true },
    }),
    // RL-046: Car Health reads the whole mileage history and the tyres.
    prisma.odometerReading.findMany({
      where: { vehicleId: vehicle.id },
      select: { id: true, km: true, readAt: true, isOverride: true, createdAt: true },
    }),
    prisma.tyreSet.findMany({
      where: { vehicleId: vehicle.id },
      select: { id: true, isFitted: true, treadDepthMm: true, dotYear: true, fittedAt: true, fittedKm: true },
    }),
  ])
  const health = computeHealth({
    vehicleId: vehicle.id,
    projectType: vehicle.projectType,
    now: new Date(),
    documents,
    tasks,
    readings,
    tyreSets: tyreSets.map((set) => ({ ...set, treadDepthMm: toNumberOrNull(set.treadDepthMm) })),
    serviceInterval: { km: vehicle.serviceIntervalKm, months: vehicle.serviceIntervalMonths },
  })
  // RL-019: Pro-gated, restoration only — the vehicle's plan (a
  // collaborator's own tier is irrelevant, same as everywhere else).
  const restorationPro = vehicle.projectType === 'RESTORATION' && (await vehicleHasPro(vehicle))
  // The page anyone else sees. Only reachable from the edit form until
  // now, and only as unlinked text — so an owner could publish a build and
  // never see what had been published.
  const publicOwner = vehicle.isPublic
    ? await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { username: true } })
    : null
  const publicUrl =
    publicOwner?.username && vehicle.slug ? `/builds/${publicOwner.username}/${vehicle.slug}` : null

  const originalityScore =
    restorationPro ? computeOriginalityScore(tasks, completeStatus) : undefined
  // RL-032: "removed collaborator" tag — a task can outlive the
  // collaborator who logged it once the owner revokes their access. A
  // user with any ACTIVE row (re-invited after removal) is not tagged.
  const activeCollaboratorUserIds = new Set(
    collaborators.filter((c) => c.status === 'ACTIVE' && c.collaboratorUserId).map((c) => c.collaboratorUserId)
  )
  const removedCollaboratorUserIds = new Set(
    collaborators
      .filter((c) => c.status === 'REMOVED' && c.collaboratorUserId && !activeCollaboratorUserIds.has(c.collaboratorUserId))
      .map((c) => c.collaboratorUserId)
  )

  const documentsNeedingAttention = documents.filter(
    (d) => getDocumentStatus(d.expiryDate).status !== 'valid'
  ).length
  const isHistoric = isHistoricVehicle(vehicle.year)

  const categoriesWithCompletion = new Set(
    tasks.filter((t) => t.status === completeStatus).map((t) => t.category)
  )
  const progressPct = Math.round((categoriesWithCompletion.size / config.categories.length) * 100)

  const totalSpent = tasks.reduce((sum, t) => {
    const cost =
      t.workType === 'WORKSHOP'
        ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
        : toNumberOrNull(t.costRon) ?? 0
    return sum + cost
  }, 0)
  const completedCount = tasks.filter((t) => t.status === completeStatus).length
  const plannedCount = tasks.length - completedCount

  // Every section a vehicle has, grouped by what it is for. The visibility
  // rules are the ones each link has always had — who may see costs, which
  // mode, owner vs collaborator vs driver — only the layout changed.
  const base = `/dashboard/vehicles/${vehicle.id}`
  const costsVisible = !hidesCosts(vehicle)
  type SectionLink = { href: string; label: string; count?: number; external?: boolean }
  const when = (condition: boolean, link: SectionLink): SectionLink[] => (condition ? [link] : [])
  const sectionGroups: { key: 'records' | 'planning' | 'share'; links: SectionLink[] }[] = [
    {
      key: 'records',
      links: [
        ...when(isOwner, { href: `${base}/documents`, label: t('documents'), count: documentsNeedingAttention }),
        { href: `${base}/service-book`, label: t('serviceBook') },
        { href: `${base}/photos`, label: t('photos') },
        { href: `${base}/fuel`, label: t('fuel') },
        ...when(vehicle.projectType !== 'RESTORATION', { href: `${base}/tyres`, label: t('tyres') }),
        { href: `${base}/expenses`, label: t('expenses') },
        { href: `${base}/accidents`, label: t('accidents') },
        ...when(isOwner || vehicle.access === 'driver', { href: `${base}/trips`, label: t('trips') }),
        ...when(isOwner && Boolean(vehicle.organizationId), { href: `${base}/drivers`, label: t('drivers') }),
        ...when(vehicle.projectType === 'RESTORATION', { href: `${base}/found-state`, label: t('foundState') }),
        ...when(isOwner && vehicle.projectType === 'OFFROAD', { href: `${base}/trail-log`, label: t('trailLog') }),
      ],
    },
    {
      key: 'planning',
      links: [
        ...when(isOwner, { href: `${base}/wishlist`, label: config.wishlistLabel }),
        ...when(costsVisible, { href: `${base}/costs`, label: t('costs') }),
        ...when(costsVisible, { href: `${base}/analytics`, label: t('analytics') }),
        ...when(isOwner && vehicle.projectType === 'RESTORATION', { href: `${base}/vin-decoder`, label: t('vinDecoder') }),
      ],
    },
    {
      key: 'share',
      links: [
        ...when(isOwner, { href: `${base}/passport`, label: t('passport') }),
        ...when(isOwner, { href: `${base}/collaborators`, label: t('collaborators') }),
        ...when(isOwner, { href: `${base}/export`, label: t('exportPdf') }),
        ...when(isOwner && vehicle.projectType !== 'DAILY_DRIVER', { href: `${base}/card`, label: t('shareCard') }),
        ...when(!isOwner, { href: `${base}/job-report`, label: t('jobReport') }),
        ...when(Boolean(publicUrl), { href: publicUrl ?? '', label: t('viewPublicPage'), external: true }),
      ],
    },
  ]

  const grouped = new Map<string, typeof tasks>()
  for (const category of config.categories) grouped.set(category.value, [])
  for (const task of tasks) {
    if (!grouped.has(task.category)) grouped.set(task.category, [])
    grouped.get(task.category)!.push(task)
  }
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const aLatest = a[1][0]?.updatedAt?.getTime() ?? 0
    const bLatest = b[1][0]?.updatedAt?.getTime() ?? 0
    return bLatest - aLatest
  })
  // Categories with work in them get their own list; the empty ones are
  // one row of shortcuts rather than a card each. A new off-road build has
  // nine categories, so the old layout was nine identical empty boxes to
  // scroll past before anything that had actually been logged.
  const filledGroups = sortedGroups.filter(([, categoryTasks]) => categoryTasks.length > 0)
  const emptyCategories = sortedGroups.filter(([, categoryTasks]) => categoryTasks.length === 0).map(([value]) => value)

  return (
    <div>
      {/* Every screen under a vehicle links back to the vehicle; the vehicle
          itself had nothing, so the only way back to the garage was the
          logo in the header, which does not read as a link. */}
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: td('title') })}
      </Link>
      <ReadOnlyVehicleNotice vehicle={vehicle} isOwner={isOwner} />
      {vehicle.access === 'driver' && (
        <DriverPanel vehicleId={vehicle.id} projectType={vehicle.projectType} driverUserId={session.user.id} />
      )}
      {/* The title and the one thing people come here to do share a row;
          everything else is a section link, grouped below. These used to be
          seventeen equal-weight buttons in a flex row beside the title,
          which on a desktop squeezed "2007 Suzuki Grand Vitara" into a
          column one word wide, and on a phone stacked into a wall of
          buttons with the primary action at the bottom of it. */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-brand">{config.label}</span>
            {originalityScore !== undefined && <OriginalityBadge score={originalityScore} />}
          </div>
          <h1 className="mt-2 break-words text-2xl font-bold text-ink sm:text-3xl">{config.screenTitle}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
            <span>
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.generation ? ` (${vehicle.generation})` : ''}
            </span>
            <PlateBadge plate={vehicle.plate} />
          </p>
          <RegistrationSummary vehicle={vehicle} />
        </div>
        <div className="flex shrink-0 gap-2">
          {isOwner && (
            <Link href={`/dashboard/vehicles/${vehicle.id}/edit`} className="btn-secondary">
              {t('settings')}
            </Link>
          )}
          <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/new`} className="btn-primary flex-1 sm:flex-none">
            {config.addTaskCta}
          </Link>
        </div>
      </div>

      <nav aria-label={t('sectionsNav')} className="mb-6 space-y-3 sm:space-y-2">
        {sectionGroups
          .filter((group) => group.links.length > 0)
          .map((group) => (
            <div key={group.key} className="sm:flex sm:items-start sm:gap-3">
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint sm:mb-0 sm:w-36 sm:shrink-0 sm:pt-2">
                {t(`sectionGroup.${group.key}`)}
              </h2>
              <ul className="scroll-row min-w-0">
                {group.links.map((link) => (
                  <li key={link.href} className="shrink-0">
                    <Link
                      href={link.href}
                      className="chip"
                      {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      {link.label}
                      {link.external && <span aria-hidden>↗</span>}
                      {link.count ? (
                        <span
                          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white"
                          aria-label={t('needsAttentionCount', { count: link.count })}
                        >
                          {link.count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </nav>

      {!isOwner && (
        <div className="card mb-6 border-surface-border bg-surface-subtle p-4 text-sm text-ink-muted">
          {t('collaboratorNotice')}
        </div>
      )}

      {/* RL-046: the answer to "is this car alright?", first. */}
      <VehicleHealthPanel report={health} />

      {vehicle.coverPhotoUrl ? (
        <div className="card mb-6 overflow-hidden">
          <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={`${vehicle.make} ${vehicle.model}`} />
        </div>
      ) : (
        // Shown empty rather than not at all, so the cover is discoverable:
        // it could only be set while creating the vehicle, and nothing on
        // this screen ever hinted that it existed.
        isOwner && (
          <Link
            href={`/dashboard/vehicles/${vehicle.id}/edit`}
            className="card mb-6 flex h-16 items-center justify-center text-sm text-ink-faint hover:text-brand-600 dark:hover:text-brand-300"
          >
            + {tCover('addFromVehicle')}
          </Link>
        )
      )}

      {isHistoric && (
        <div className="card mb-6 border-surface-border bg-surface-subtle p-4 text-sm text-ink-muted">
          {t.rich('historicNotice', {
            strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
          })}{' '}
          <Link href={`/dashboard/vehicles/${vehicle.id}/documents`} className="text-brand-600 dark:text-brand-300 hover:underline">
            {t('manageDocuments')}
          </Link>
        </div>
      )}

      {vehicle.projectType === 'RESTORATION' && !foundState && (
        <div className="card mb-6 flex flex-col gap-3 note p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm text-ink">
            {t('foundStatePrompt')}
          </p>
          <Link href={`/dashboard/vehicles/${vehicle.id}/found-state`} className="btn-primary shrink-0">
            {t('completeIntake')}
          </Link>
        </div>
      )}

      {/* A build or restoration works towards a finished state, so it gets a
          completion bar. A daily driver's log just accumulates — showing it
          as "17% complete" would be meaningless — so it gets a running count. */}
      <div className="card mb-6 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink-muted">{config.progressLabel}</span>
          <span className="text-sm font-semibold text-ink">
            {config.tracksCompletion ? `${progressPct}%` : tasks.length}
          </span>
        </div>
        {config.tracksCompletion && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard
          label={t('totalSpent')}
          value={
            hidesCosts(vehicle)
              ? t('hidden')
              : formatRon(totalSpent)
          }
        />
        <StatCard
          label={config.tracksCompletion ? t('completed') : t('done')}
          value={String(completedCount)}
        />
        <StatCard
          label={config.tracksCompletion ? t('planned') : t('outstanding')}
          value={String(plannedCount)}
        />
      </div>

      <OdometerCard vehicleId={vehicle.id} latest={latestReading} />

      {tasks.length === 0 && (
        /* RL-036: the categories below already carry an add link each, but
           a first-time owner sees a column of identical links with nothing
           saying what a "job" holds. One card says it, once. */
        <div className="card mb-6 p-4">
          <h2 className="mb-1 font-semibold text-ink">{t('emptyTitle')}</h2>
          <p className="text-sm text-ink-muted">{t('emptyBody')}</p>
        </div>
      )}

      <div className="space-y-6">
        {filledGroups.map(([categoryValue, categoryTasks]) => (
          <div key={categoryValue}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {labelFor(config.categories, categoryValue)}
            </h2>
            {/* The same prefilled link stays at the foot of a category that
                already has entries. It used to render only while the
                category was empty, which left no way to log a second job
                under it — a daily driver gets its brakes done more than
                once, and the header's + button starts with no category
                chosen. */}
            <div className="card divide-y divide-surface-border">
              {categoryTasks.map((task) => (
                // Hidden while its deletion waits out the undo window
                // (RL-034) — the task page sent the owner back here.
                <HideWhilePending key={task.id} pendingKey={`task:${task.id}`}>
                  <Link
                    href={`/dashboard/vehicles/${vehicle.id}/tasks/${task.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-surface-muted"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {task.workType === 'WORKSHOP' && <span title={t('workshopTask')}>🔧</span>}
                      {/* addedByUserId is null once the account that added
                          the task is deleted — the work stays in the log,
                          the attribution doesn't. */}
                      {task.addedByUserId !== vehicle.ownerId && (
                        <AddedByBadge
                          name={task.addedBy?.displayName ?? null}
                          removed={
                            task.addedByUserId === null ||
                            removedCollaboratorUserIds.has(task.addedByUserId)
                          }
                        />
                      )}
                      <div className="min-w-0">
                        <div className="break-words font-medium text-ink">{task.name}</div>
                        <div className="text-xs text-ink-faint">
                          {new Date(task.date).toLocaleDateString('ro-RO')}
                        </div>
                      </div>
                    </div>
                    <span className={`${statusBadgeClass(config.statusTags, task.status)} shrink-0`}>
                      {labelFor(config.statusTags, task.status)}
                    </span>
                  </Link>
                </HideWhilePending>
              ))}
              <Link
                href={`/dashboard/vehicles/${vehicle.id}/tasks/new?category=${categoryValue}`}
                className="block p-4 text-sm text-ink-faint hover:bg-surface-muted hover:text-brand-600 dark:hover:text-brand-300"
              >
                {t('addInCategory', { cta: config.addTaskCta })}
              </Link>
            </div>
          </div>
        ))}

        {emptyCategories.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {filledGroups.length > 0 ? t('otherCategories') : t('startInCategory')}
            </h2>
            <p className="mb-3 mt-1 text-sm text-ink-faint">{t('otherCategoriesHint')}</p>
            <ul className="flex flex-wrap gap-2">
              {emptyCategories.map((categoryValue) => (
                <li key={categoryValue}>
                  <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/new?category=${categoryValue}`} className="chip">
                    <span aria-hidden className="text-brand-600 dark:text-brand-300">+</span>
                    {labelFor(config.categories, categoryValue)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

async function AddedByBadge({ name, removed }: { name: string | null; removed: boolean }) {
  const t = await getTranslations('vehicle')

  if (!name) {
    // The account is gone. Saying who added it would be a lie, and hiding
    // the badge entirely would make the task look like the owner's own.
    return (
      <span
        title={t('addedByDeleted')}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-faint/20 text-[10px] font-semibold text-ink-faint"
      >
        ?
      </span>
    )
  }

  return (
    <span
      title={removed ? t('addedByRemoved', { name }) : t('addedBy', { name })}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
        removed ? 'bg-ink-faint/20 text-ink-faint line-through' : 'badge-brand'
      }`}
    >
      {initials(name)}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="break-words text-base font-semibold tabular-nums text-ink sm:text-lg">{value}</div>
    </div>
  )
}

/** RL-044: what the odometer reads, and the one-number way to update it. */
async function OdometerCard({ vehicleId, latest }: { vehicleId: string; latest: { km: number; readAt: Date } | null }) {
  const t = await getTranslations('odometer')
  return (
    <div className="card mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs text-ink-faint">{t('title')}</div>
          {latest ? (
            <div className="text-ink">
              <span className="text-lg font-semibold">{t('km', { km: latest.km.toLocaleString('ro-RO') })}</span>{' '}
              <span className="text-sm text-ink-muted">
                {t('readOn', { date: latest.readAt.toLocaleDateString('ro-RO', { timeZone: 'UTC' }) })}
              </span>
            </div>
          ) : (
            <div className="text-sm text-ink-muted">{t('none')}</div>
          )}
        </div>
        <Link href={`/dashboard/vehicles/${vehicleId}/odometer`} className="text-sm text-brand-600 hover:underline dark:text-brand-300">
          {t('seeHistory')}
        </Link>
      </div>
      <OdometerQuickAdd vehicleId={vehicleId} compact />
    </div>
  )
}
