import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import { serviceBook, type ServiceBook } from '@/lib/serviceBook'

/**
 * The service book for one vehicle, read the same way by the page and the
 * PDF route so the two cannot list different jobs. Only completed jobs are
 * read; the km is the reading written with the job.
 */
export async function loadServiceBook(vehicleId: string, completeStatus: string): Promise<ServiceBook> {
  const [tasks, overrides] = await Promise.all([
    prisma.task.findMany({
      where: { vehicleId, status: completeStatus },
      select: {
        id: true,
        name: true,
        status: true,
        category: true,
        date: true,
        workType: true,
        costRon: true,
        partsCostRon: true,
        labourCostRon: true,
        brand: true,
        notes: true,
        workshopName: true,
        receiptUrl: true,
        createdAt: true,
        odometerReading: { select: { km: true } },
        _count: { select: { photos: true } },
      },
    }),
    prisma.odometerReading.findMany({
      where: { vehicleId, isOverride: true },
      select: { readAt: true, overrideReason: true },
      orderBy: { readAt: 'asc' },
    }),
  ])

  return serviceBook(
    tasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      date: t.date,
      workType: t.workType,
      costRon: toNumberOrNull(t.costRon),
      partsCostRon: toNumberOrNull(t.partsCostRon),
      labourCostRon: toNumberOrNull(t.labourCostRon),
      brand: t.brand,
      notes: t.notes,
      workshopName: t.workshopName,
      receiptUrl: t.receiptUrl,
      createdAt: t.createdAt,
      photoCount: t._count.photos,
      km: t.odometerReading?.km ?? null,
    })),
    completeStatus,
    overrides
  )
}
