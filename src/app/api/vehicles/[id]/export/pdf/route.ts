import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { PROJECT_TYPE_CONFIG, labelFor } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'
import { renderPdf, resolveImageDataUri, resolvePhotos, pdfFilename } from '@/lib/pdf'
import { buildVehicleHistoryDocDefinition, type PdfTaskCategory } from '@/lib/pdfBuildHistory'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-014: build history PDF export, Pro only. Generation can take a few
// seconds for a large project (up to 50 tasks / 100 photos per the ticket's
// budget) — give it more headroom than Vercel's 10s hobby default.
export const maxDuration = 60

const MAX_TASK_PHOTOS = 3
const MAX_FOUND_STATE_PHOTOS = 4

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (!hasPro(owner)) {
    return NextResponse.json(
      { error: 'PDF export is a Pro feature. Upgrade to export your full build history.', code: 'UPGRADE_REQUIRED' },
      { status: 403 }
    )
  }

  try {
    const config = PROJECT_TYPE_CONFIG[vehicle.projectType]

    const [tasks, foundState] = await Promise.all([
      prisma.task.findMany({
        where: { vehicleId: vehicle.id },
        orderBy: { date: 'asc' },
        include: { photos: { orderBy: { createdAt: 'asc' } } },
      }),
      vehicle.projectType === 'RESTORATION'
        ? prisma.foundState.findUnique({ where: { vehicleId: vehicle.id }, include: { photos: { orderBy: { createdAt: 'asc' } } } })
        : Promise.resolve(null),
    ])

    const completeStatus = config.completeStatus
    const categoriesWithCompletion = new Set(tasks.filter((t) => t.status === completeStatus).map((t) => t.category))
    const progressPct = Math.round((categoriesWithCompletion.size / config.categories.length) * 100)
    const totalSpent = tasks.reduce((sum, t) => {
      const cost =
        t.workType === 'WORKSHOP'
          ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
          : toNumberOrNull(t.costRon) ?? 0
      return sum + cost
    }, 0)

    const categories: PdfTaskCategory[] = []
    for (const category of config.categories) {
      const categoryTasks = tasks.filter((t) => t.category === category.value)
      if (categoryTasks.length === 0) continue
      categories.push({
        categoryLabel: category.label,
        tasks: await Promise.all(
          categoryTasks.map(async (t) => ({
            name: t.name,
            brand: t.brand,
            statusLabel: labelFor(config.statusTags, t.status),
            workType: t.workType,
            date: t.date,
            totalCost:
              t.workType === 'WORKSHOP'
                ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
                : toNumberOrNull(t.costRon) ?? 0,
            workshopName: t.workshopName,
            notes: t.notes,
            photos: await resolvePhotos(t.photos.map((p) => p.url), MAX_TASK_PHOTOS),
          }))
        ),
      })
    }

    const coverPhotoDataUri = vehicle.coverPhotoUrl ? await resolveImageDataUri(vehicle.coverPhotoUrl) : null

    const docDefinition = buildVehicleHistoryDocDefinition({
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      projectType: vehicle.projectType,
      generation: vehicle.generation,
      engine: vehicle.engine,
      vin: vehicle.vin,
      coverPhotoDataUri,
      progressLabel: config.progressLabel,
      progressPct,
      totalSpent,
      categories,
      foundState: foundState
        ? {
            acquisitionDate: foundState.acquisitionDate,
            purchasePriceRon: toNumberOrNull(foundState.purchasePriceRon),
            odometer: foundState.odometer,
            knownHistory: foundState.knownHistory,
            conditionRating: foundState.conditionRating,
            photos: await resolvePhotos(foundState.photos.map((p) => p.url), MAX_FOUND_STATE_PHOTOS),
          }
        : null,
      generatedAt: new Date(),
    })

    const buffer = await renderPdf(docDefinition)
    const filename = pdfFilename('RigLog', `${vehicle.year} ${vehicle.make} ${vehicle.model}`)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (e) {
    console.error('PDF export failed:', e)
    return NextResponse.json({ error: 'Could not generate PDF' }, { status: 500 })
  }
}
