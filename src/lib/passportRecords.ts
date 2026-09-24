import { randomBytes } from 'crypto'
import type { Vehicle } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'
import { loadServiceBook } from '@/lib/serviceBookRecords'
import { buildPassport, type Passport, type PassportOptions } from '@/lib/passport'

/** 32 random bytes — the link is the only credential a buyer holds. */
export function newPassportToken(): string {
  return randomBytes(32).toString('base64url')
}

export const PASSPORT_PHOTO_LIMIT = 6

export interface PassportView {
  passport: Passport
  /** Only for a public vehicle: /api/uploads serves its photos without a
   *  session through RL-018's carve-out. A passport link never widens that. */
  photos: Array<{ url: string; caption: string | null }>
  publicUrl: string | null
}

/**
 * Everything the passport shows, read once for the owner's preview, the
 * shared link and the PDF alike. Jobs come through loadServiceBook(), so
 * the passport and the service book cannot list different work.
 */
export async function loadPassport(vehicle: Vehicle, options: PassportOptions, now: Date = new Date()): Promise<PassportView> {
  const completeStatus = PROJECT_TYPE_CONFIG[vehicle.projectType].completeStatus
  const [book, readings, fuel, charges, documents, tyreSets, accidents, owner, photos] = await Promise.all([
    loadServiceBook(vehicle.id, completeStatus),
    prisma.odometerReading.findMany({
      where: { vehicleId: vehicle.id },
      select: { id: true, km: true, readAt: true, isOverride: true, overrideReason: true, createdAt: true },
    }),
    prisma.fuelEntry.findMany({ where: { vehicleId: vehicle.id }, select: { date: true } }),
    // RL-053: a charge is record activity too, or an EV's passport would
    // list a year of charging as a gap in its records.
    prisma.chargeEntry.findMany({ where: { vehicleId: vehicle.id }, select: { date: true } }),
    prisma.document.findMany({ where: { vehicleId: vehicle.id }, select: { type: true, expiryDate: true } }),
    prisma.tyreSet.findMany({ where: { vehicleId: vehicle.id }, select: { season: true, label: true, isFitted: true, dotYear: true } }),
    // Photos are counted, never shown: they stay behind the owner's session.
    prisma.accident.findMany({ where: { vehicleId: vehicle.id }, include: { _count: { select: { photos: true } } } }),
    vehicle.isPublic ? prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { username: true } }) : Promise.resolve(null),
    vehicle.isPublic
      ? prisma.taskPhoto.findMany({
          where: { vehicleId: vehicle.id },
          orderBy: { createdAt: 'desc' },
          select: { url: true, caption: true },
          take: PASSPORT_PHOTO_LIMIT,
        })
      : Promise.resolve([]),
  ])

  const passport = buildPassport({
    now,
    projectType: vehicle.projectType,
    options,
    vehicle,
    rows: book.rows,
    readings,
    fuelDates: [...fuel, ...charges].map((f) => f.date),
    documents,
    tyreSets,
    accidents: accidents.map((a) => ({
      date: a.date,
      kind: a.kind,
      description: a.description,
      km: a.km,
      insurance: a.insurance,
      repairedAt: a.repairedAt,
      repairCostRon: toNumberOrNull(a.repairCostRon),
      photoCount: a._count.photos,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  })

  return {
    passport,
    photos,
    publicUrl: vehicle.isPublic && owner?.username && vehicle.slug ? `/builds/${owner.username}/${vehicle.slug}` : null,
  }
}
