import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { PLAN_SELECT, vehicleLimit } from '@/lib/plans'
import { isVehicleReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-042 (#54): says so, at the top of a vehicle, when it is read-only
 * because its owner holds more personal vehicles than their plan covers.
 * Nothing was deleted, and the owner is told the three ways back: a plan
 * that covers it, removing another vehicle, or moving one into an
 * organisation. A collaborator is told only that the owner's plan stopped
 * covering it — the owner's options are not theirs to act on.
 */
export default async function ReadOnlyVehicleNotice({
  vehicle,
  isOwner,
}: {
  vehicle: { id: string; ownerId: string; organizationId: string | null }
  isOwner: boolean
}) {
  if (!(await isVehicleReadOnly(vehicle))) return null
  const t = await getTranslations('readOnly')

  // A company vehicle is read-only because the organisation's plan does not
  // cover it (lapsed, or more vehicles than it allows): its managers see
  // where to fix that — billing is the OWNERs' — and nobody else is told
  // anything they cannot act on.
  if (vehicle.organizationId) {
    return (
      <div className="note-warn mb-6 rounded-lg p-4 text-sm" role="status">
        <p className="font-semibold">{t('title')}</p>
        <p className="mt-1">{isOwner ? t('companyManagerBody') : t('companyBody')}</p>
        {isOwner && (
          <Link href={`/dashboard/organizations/${vehicle.organizationId}`} className="btn-secondary mt-3">
            {t('seeOrganization')}
          </Link>
        )}
      </div>
    )
  }

  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: PLAN_SELECT })
  const limit = vehicleLimit(owner) ?? 0

  return (
    <div className="note-warn mb-6 rounded-lg p-4 text-sm" role="status">
      <p className="font-semibold">{t('title')}</p>
      <p className="mt-1">{isOwner ? t('ownerBody', { limit }) : t('collaboratorBody')}</p>
      {isOwner && (
        <Link href="/dashboard/upgrade" className="btn-secondary mt-3">
          {t('seePlans')}
        </Link>
      )}
    </div>
  )
}
