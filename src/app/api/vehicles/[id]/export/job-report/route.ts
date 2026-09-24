import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { labelFor } from '@/lib/projectType'
import { translateConfig } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import { renderPdf, resolvePhotos, pdfFilename } from '@/lib/pdf'
import { buildJobReportDocDefinition, type JobReportTask } from '@/lib/pdfJobReport'
import { formatRon } from '@/lib/money'

// RL-033: job report — always free, for any collaborator regardless of
// tier (never paywalled — this is the workshop acquisition mechanic, see
// the ticket). A collaborator generates their own; the owner can generate
// one for any collaborator via ?collaboratorId=.
export const maxDuration = 60

const MAX_TASK_PHOTOS = 3
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const isOwner = vehicle.access === 'owner'
  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') === 'all' ? 'all' : '30d'

  // Owners pick which collaborator's report to generate; a collaborator
  // can only ever generate their own — the query param is ignored for them
  // so one collaborator can't request a report scoped to another's work.
  let collaboratorUserId: string
  if (isOwner) {
    const requested = searchParams.get('collaboratorId')
    if (!requested) return await apiError('collaboratorIdRequired', 400)
    collaboratorUserId = requested
  } else {
    collaboratorUserId = session.user.id
  }

  const collaboratorRow = await prisma.projectCollaborator.findFirst({
    where: { vehicleId: vehicle.id, collaboratorUserId },
    orderBy: { invitedAt: 'desc' },
    include: { collaboratorUser: { select: { displayName: true } } },
  })
  if (!collaboratorRow) return await apiError('notACollaborator', 404)

  try {
    // Translated, for the same reason as the build-history export: the
    // raw config is the English source of truth, not the reader's words.
    const config = translateConfig(vehicle.projectType, await translator(localeFromRequest(), 'vocab'))
    const cutoff = range === '30d' ? new Date(Date.now() - THIRTY_DAYS_MS) : null

    const tasks = await prisma.task.findMany({
      where: {
        vehicleId: vehicle.id,
        addedByUserId: collaboratorUserId,
        ...(cutoff ? { date: { gte: cutoff } } : {}),
      },
      orderBy: { date: 'asc' },
      include: { photos: { orderBy: { createdAt: 'asc' } } },
    })

    const jobReportTasks: JobReportTask[] = await Promise.all(
      tasks.map(async (t) => {
        const partsCostRon = toNumberOrNull(t.partsCostRon) ?? 0
        const labourCostRon = toNumberOrNull(t.labourCostRon) ?? 0
        // A DIY-logged task has no parts/labour split — a collaborator
        // billing for their own work bills it as labour, not parts.
        const diyCost = t.workType === 'DIY' ? toNumberOrNull(t.costRon) ?? 0 : 0
        return {
          name: t.name,
          category: labelFor(config.categories, t.category),
          date: t.date,
          workType: t.workType,
          partsCostRon: t.workType === 'WORKSHOP' ? partsCostRon : 0,
          labourCostRon: t.workType === 'WORKSHOP' ? labourCostRon : diyCost,
          photos: await resolvePhotos(t.photos.map((p) => p.url), MAX_TASK_PHOTOS),
        }
      })
    )

    const collaboratorName = collaboratorRow.collaboratorUser?.displayName ?? collaboratorRow.label ?? collaboratorRow.email
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

    // The reader is whoever pressed Export, so this follows the browser
    // rather than an account column — unlike an email, which is read by
    // its recipient.
    const tPdf = await translator(localeFromRequest(), 'pdf')
    const money = (n: number) => formatRon(n)

    const docDefinition = buildJobReportDocDefinition({
      strings: {
        title: tPdf('jobReportTitle'),
        preparedBy: tPdf('preparedBy'),
        period: tPdf('period'),
        totalLabour: (total) => tPdf('totalLabour', { total: money(total) }),
        totalParts: (total) => tPdf('totalParts', { total: money(total) }),
        noTasks: tPdf('noTasks'),
        documentedWith: tPdf('documentedWith'),
        taskMeta: (task) =>
          tPdf('taskMeta', {
            date: task.date.toLocaleDateString('ro-RO'),
            category: task.category,
            parts: money(task.partsCostRon),
            labour: money(task.labourCostRon),
          }),
      },
      collaboratorName,
      vehicleName,
      rangeLabel: range === '30d' ? tPdf('last30Days') : tPdf('allTime'),
      tasks: jobReportTasks,
      generatedAt: new Date(),
    })

    const buffer = await renderPdf(docDefinition)
    const filename = pdfFilename('RigLog_JobReport', vehicleName)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (e) {
    console.error('Job report export failed:', e)
    return await apiError('jobReportFailed', 500)
  }
}
