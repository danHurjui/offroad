import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { labelFor } from '@/lib/projectType'
import { translateConfig } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import { renderPdf, resolveImageDataUri, resolvePhotos, pdfFilename } from '@/lib/pdf'
import { buildVehicleHistoryDocDefinition, type PdfTaskCategory } from '@/lib/pdfBuildHistory'
import { vehicleHasPro } from '@/lib/entitlement'

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
  if (!vehicle) return await apiError('notFound', 404)

  if (!(await vehicleHasPro(vehicle))) {
    return await apiError('proPdfExport', 403, { code: 'UPGRADE_REQUIRED' })
  }

  try {
    // The *translated* vocabulary, through the context-free translator.
    // This read PROJECT_TYPE_CONFIG directly, which is the untranslated
    // source of truth — so every category name, status tag and progress
    // label in the exported PDF came out in English however the rest of
    // the document was written. getVocabulary() would not do either: it
    // resolves the locale through React's server context, and a route
    // handler composing a document should name the language it means.
    const tVocab = await translator(localeFromRequest(), 'vocab')
    const config = translateConfig(vehicle.projectType, tVocab)

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

    // The reader is whoever pressed Export, so the PDF speaks the
    // browser's language rather than an account column — unlike an email,
    // which is read by its recipient.
    const tPdf = await translator(localeFromRequest(), 'pdf')

    const docDefinition = buildVehicleHistoryDocDefinition({
      strings: {
        subtitle: tPdf(`subtitle.${vehicle.projectType}`),
        generation: tPdf('generation'),
        engine: tPdf('engine'),
        vin: tPdf('vin'),
        // The mode's own word for progress ("Restored", "Built"), so the
        // tile says what this vehicle is working towards.
        progressLabel: config.progressLabel,
        totalSpentLabel: tPdf('totalSpentLabel'),
        jobsLoggedLabel: tPdf('jobsLoggedLabel'),
        periodLabel: tPdf('periodLabel'),
        expenses: tPdf('expenses'),
        byCategory: tPdf('byCategory'),
        everyExpense: tPdf('everyExpense'),
        colDate: tPdf('colDate'),
        colItem: tPdf('colItem'),
        colCategory: tPdf('colCategory'),
        colType: tPdf('colType'),
        colAmount: tPdf('colAmount'),
        total: tPdf('total'),
        noExpenses: tPdf('noExpenses'),
        foundState: tPdf('foundState'),
        acquired: tPdf('acquired'),
        purchasePrice: tPdf('purchasePrice'),
        odometer: tPdf('odometer'),
        condition: tPdf('condition'),
        workshop: tPdf('workshop'),
        diy: tPdf('diy'),
        generatedOn: tPdf('generatedOn', { date: new Date().toLocaleDateString('ro-RO') }),
      },
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
    return await apiError('pdfFailed', 500)
  }
}
