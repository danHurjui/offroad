import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { canManageOrganization } from '@/lib/organizations'
import { accessForRole } from '@/lib/access'
import OrganizationForm from '@/components/OrganizationForm'
import OrganizationMembers from '@/components/OrganizationMembers'
import OrganizationDelete from '@/components/OrganizationDelete'
import OrganizationInvites from '@/components/OrganizationInvites'
import { inviteStatus } from '@/lib/organizationInvites'
import OrgPlanSummary from '@/components/OrgPlanSummary'
import OrganizationSites from '@/components/OrganizationSites'
import { orgReadOnlyVehicleIds } from '@/lib/vehicleAllowance'

// RL-038: one organisation. Anyone in it sees who else is; owners edit the
// details, manage roles and can delete it. Outsiders get a 404.
export default async function OrganizationPage({ params }: { params: { orgId: string } }) {
  const t = await getTranslations('organizations')
  const tc = await getTranslations('common')
  const tf = await getTranslations('fleet')
  const session = await requireSessionOrRedirect()
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.orgId, userId: session.user.id } },
    include: { organization: true },
  })
  if (!membership) notFound()
  const org = membership.organization
  const manager = canManageOrganization(membership.role)
  // Owners and fleet managers manage the vehicles, so both get the board.
  const managesVehicles = accessForRole(membership.role) === 'owner'

  const [members, vehicles] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    // Every member has at least collaborator access to these (access.ts).
    prisma.vehicle.findMany({
      where: { organizationId: org.id },
      select: { id: true, year: true, make: true, model: true, plate: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])
  const readOnly = managesVehicles ? await orgReadOnlyVehicleIds(org.id) : new Set<string>()
  // #103: the sites are for the people who run the fleet.
  const sites = managesVehicles
    ? (
        await prisma.organizationSite.findMany({
          where: { organizationId: org.id },
          select: { id: true, name: true, _count: { select: { vehicles: true } } },
          orderBy: { name: 'asc' },
        })
      ).map((s) => ({ id: s.id, name: s.name, vehicles: s._count.vehicles }))
    : []
  // Open invitations only — accepted ones are members above, withdrawn ones are gone.
  const invites = manager
    ? (
        await prisma.organizationInvite.findMany({
          where: { organizationId: org.id, acceptedAt: null, revokedAt: null },
          select: { id: true, email: true, role: true, invitedAt: true, acceptedAt: true, revokedAt: true },
          orderBy: { invitedAt: 'desc' },
        })
      ).map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: inviteStatus(i) === 'expired' ? ('expired' as const) : ('pending' as const),
        invitedAt: i.invitedAt.toISOString(),
      }))
    : []

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/organizations" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: t('title') })}
      </Link>
      <h1 className="mb-1 break-words text-2xl font-bold text-ink">{org.name}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        {org.cui ? t('cuiLine', { cui: org.cui }) : t('noCui')}
        {' · '}
        {t('yourRole', { role: t(`role.${membership.role}`) })}
      </p>

      {managesVehicles && (
        <OrgPlanSummary
          org={org}
          vehicleCount={vehicles.length}
          readOnlyCount={readOnly.size}
          isOwner={manager}
          choice={vehicles.map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ''}`, chosen: !readOnly.has(v.id) }))}
        />
      )}

      {manager && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('detailsTitle')}</h2>
          <OrganizationForm
            organizationId={org.id}
            initial={{ name: org.name, cui: org.cui ?? '', billingAddress: org.billingAddress ?? '' }}
          />
        </section>
      )}

      {managesVehicles && vehicles.length > 0 && (
        <Link href={`/dashboard/organizations/${org.id}/fleet`} className="btn-primary mb-6 inline-block">
          {tf('open')}
        </Link>
      )}

      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('vehiclesTitle')}</h2>
      <p className="mb-3 text-xs text-ink-faint">{t('vehiclesHelp')}</p>
      {vehicles.length === 0 ? (
        <p className="card mb-6 p-4 text-sm text-ink-faint">{t('noVehicles')}</p>
      ) : (
        <ul className="card mb-6 divide-y divide-surface-border">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link href={`/dashboard/vehicles/${v.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface-muted">
                <span className="min-w-0 truncate text-sm font-medium text-ink">{v.year} {v.make} {v.model}</span>
                {v.plate && <span className="font-mono text-xs text-ink-muted">{v.plate}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {managesVehicles && <OrganizationSites organizationId={org.id} sites={sites} />}

      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('membersTitle')}</h2>
      <p className="mb-3 text-xs text-ink-faint">{t('rolesHelp')}</p>
      <OrganizationMembers
        organizationId={org.id}
        canManage={manager}
        members={members.map((m) => ({
          id: m.id,
          displayName: m.user.displayName,
          email: manager ? m.user.email : null,
          role: m.role,
          isYou: m.userId === session.user.id,
        }))}
      />
      {manager && (
        <div className="mt-6">
          <OrganizationInvites organizationId={org.id} invites={invites} />
        </div>
      )}

      {manager && (
        <section className="card mt-8 p-5">
          <h2 className="mb-1 text-sm font-semibold text-ink">{t('deleteTitle')}</h2>
          <p className="mb-3 text-xs text-ink-muted">{t('deleteHelp')}</p>
          <OrganizationDelete organizationId={org.id} name={org.name} vehicleCount={vehicles.length} />
        </section>
      )}
    </div>
  )
}
