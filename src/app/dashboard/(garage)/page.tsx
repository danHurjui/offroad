import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPES, type ProjectType } from '@/lib/projectType'
import { getAllVocabulary, getVocabulary } from '@/lib/vocabulary'
import VehicleCoverImg from '@/components/VehicleCoverImg'
import FirstVehicleChecklist, { type ChecklistStep } from '@/components/FirstVehicleChecklist'
import { hasPro, PRO_SELECT } from '@/lib/pro'
import {
  closeOnboarding,
  loadOnboardingCounts,
  onboardingState,
  shouldShowChecklist,
  type OnboardingStep,
} from '@/lib/onboarding'

export default async function DashboardPage() {
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
  const checklist = await checklistSteps(session.user.id, user?.onboardingClosedAt ?? null, owned, collaborating.length)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <div className="flex items-center gap-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {owned.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
          {collaborating.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} collaborator />
          ))}
        </div>
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

async function VehicleCard({
  vehicle,
  collaborator,
}: {
  vehicle: { id: string; make: string; model: string; year: number; projectType: ProjectType; coverPhotoUrl: string | null }
  collaborator?: boolean
}) {
  const t = await getTranslations('dashboard')
  const config = await getVocabulary(vehicle.projectType)
  return (
    <Link href={`/dashboard/vehicles/${vehicle.id}`} className="card block overflow-hidden hover:shadow-panel">
      <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={`${vehicle.make} ${vehicle.model}`} />
      <div className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="badge badge-brand">{config.label}</span>
          {collaborator && <span className="badge bg-surface-subtle text-ink-muted">{t('collaborator')}</span>}
        </div>
        <h2 className="font-semibold text-ink">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h2>
      </div>
    </Link>
  )
}
