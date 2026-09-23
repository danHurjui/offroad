import { randomBytes } from 'crypto'
import type { Vehicle } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
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
  const [book, readings, fuel, documents, tyreSets, owner, photos] = await Promise.all([
    loadServiceBook(vehicle.id, completeStatus),
    prisma.odometerReading.findMany({
      where: { vehicleId: vehicle.id },
      select: { id: true, km: true, readAt: true, isOverride: true, overrideReason: true, createdAt: true },
    }),
    prisma.fuelEntry.findMany({ where: { vehicleId: vehicle.id }, select: { date: true } }),
    prisma.document.findMany({ where: { vehicleId: vehicle.id }, select: { type: true, expiryDate: true } }),
    prisma.tyreSet.findMany({ where: { vehicleId: vehicle.id }, select: { season: true, label: true, isFitted: true, dotYear: true } }),
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
    fuelDates: fuel.map((f) => f.date),
    documents,
    tyreSets,
  })

  return {
    passport,
    photos,
    publicUrl: vehicle.isPublic && owner?.username && vehicle.slug ? `/builds/${owner.username}/${vehicle.slug}` : null,
  }
}
