import { NextRequest } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { isProjectType, labelFor } from '@/lib/projectType'
import { translateConfig, type VocabularyConfig } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import { jobRows } from '@/lib/fleetReport'
import { toCsv } from '@/lib/csv'
import { formatAmount } from '@/lib/money'
import { loadReport, reportDate, reportFilename, reportResponse, vehicleTitle } from '../load'

// RL-041: every job across the fleet in a period, as a CSV an accountant
// reconciles against the invoices. OWNER/FLEET_MANAGER only (load.ts).
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadReport(params.orgId, auth.session.user.id, req.nextUrl.searchParams)
  if (!loaded.ok) return loaded.error
  const { organization, period, vehicles, assignments } = loaded.report

  try {
    const locale = localeFromRequest()
    const t = await translator(locale, 'fleetReport')
    const vocab = await translator(locale, 'vocab')
    const configs = new Map<string, VocabularyConfig>()
    const configFor = (projectType: string) => {
      if (!isProjectType(projectType)) return null
      if (!configs.has(projectType)) configs.set(projectType, translateConfig(projectType, vocab))
      return configs.get(projectType)!
    }

    const tasks = vehicles.length
      ? await prisma.task.findMany({
          where: { vehicleId: { in: vehicles.map((v) => v.id) }, date: { gte: period.from, lt: period.end } },
          select: {
            id: true,
            vehicleId: true,
            date: true,
            name: true,
            category: true,
            status: true,
            notes: true,
            workType: true,
            workshopName: true,
            costRon: true,
            partsCostRon: true,
            labourCostRon: true,
            workshop: { select: { name: true } },
            addedBy: { select: { displayName: true } },
          },
        })
      : []
    const rows = jobRows(
      tasks.map((task) => ({
        ...task,
        workshopName: task.workshopName ?? task.workshop?.name ?? null,
        costRon: toNumberOrNull(task.costRon),
        partsCostRon: toNumberOrNull(task.partsCostRon),
        labourCostRon: toNumberOrNull(task.labourCostRon),
        loggedBy: task.addedBy?.displayName ?? null,
      })),
      assignments,
      period,
      vehicles.map((v) => v.id)
    )

    const byId = new Map(vehicles.map((v) => [v.id, v]))
    const amount = (n: number | null) => (n === null ? '' : formatAmount(n))
    const csv = toCsv(
      [
        t('csv.date'),
        t('csv.vehicle'),
        t('csv.registration'),
        t('csv.category'),
        t('csv.status'),
        t('csv.description'),
        t('csv.notes'),
        t('csv.workshop'),
        t('csv.parts'),
        t('csv.labour'),
        t('csv.total'),
        t('csv.loggedBy'),
        t('csv.driver'),
      ],
      rows.map((row) => {
        const vehicle = byId.get(row.vehicleId)!
        const config = configFor(vehicle.projectType)
        const workshop = row.workType === 'WORKSHOP'
        return [
          reportDate(row.date),
          vehicleTitle(vehicle),
          vehicle.plate,
          config ? labelFor(config.categories, row.category) : row.category,
          config ? labelFor(config.statusTags, row.status) : row.status,
          row.name,
          row.notes,
          workshop ? row.workshopName : t('diy'),
          // A workshop job is invoiced as parts and labour; a DIY job has
          // one amount, which is only the total.
          workshop ? amount(row.partsCostRon) : '',
          workshop ? amount(row.labourCostRon) : '',
          formatAmount(row.total),
          row.loggedBy ?? t('deletedAccount'),
          row.drivers.join(' / '),
        ]
      })
    )
    return reportResponse(csv, 'text/csv; charset=utf-8', reportFilename(['Jobs', organization.name], period, 'csv'))
  } catch (e) {
    console.error('Fleet jobs report failed:', e)
    return await apiError('reportFailed', 500)
  }
}
