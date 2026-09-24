import { NextRequest } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { loadOwnershipInputs } from '@/lib/ownershipRecords'
import { complianceEvents, costRows, spendSummary, type ExpiryOutcome } from '@/lib/fleetReport'
import { FLEET_DOCUMENT_TYPES } from '@/lib/fleet'
import { renderPdf } from '@/lib/pdf'
import { buildFleetReportDocDefinition } from '@/lib/pdfFleetReport'
import { loadReport, reportDate, reportFilename, reportResponse, vehicleTitle } from '../load'

// RL-041: the fleet summary for a period, as a PDF — spend per vehicle and
// per category (the same rows as the cost CSV), and the period's
// compliance events. OWNER/FLEET_MANAGER only (load.ts).
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadReport(params.orgId, auth.session.user.id, req.nextUrl.searchParams)
  if (!loaded.ok) return loaded.error
  const { organization, period, site, vehicles, assignments } = loaded.report

  try {
    const locale = localeFromRequest()
    const t = await translator(locale, 'fleetReport')
    const to = await translator(locale, 'ownership')
    const th = await translator(locale, 'health')
    const now = new Date()
    const ids = vehicles.map((v) => v.id)

    const [inputs, jobs, documents] = await Promise.all([
      loadOwnershipInputs(vehicles, now),
      ids.length ? prisma.task.count({ where: { vehicleId: { in: ids }, date: { gte: period.from, lt: period.end } } }) : 0,
      ids.length
        ? prisma.document.findMany({
            where: { vehicleId: { in: ids }, type: { in: [...FLEET_DOCUMENT_TYPES] } },
            select: { id: true, vehicleId: true, type: true, expiryDate: true, renewals: { select: { previousExpiry: true, newExpiry: true, renewedAt: true } } },
          })
        : [],
    ])
    const rows = costRows(vehicles.map((v) => inputs.get(v.id)!), assignments, period)
    const spend = spendSummary(rows, ids, assignments, period)
    const events = complianceEvents(documents, period, now)

    const byId = new Map(vehicles.map((v) => [v.id, v]))
    const shortName = (id: string) => {
      const v = byId.get(id)!
      return v.plate ?? `${v.make} ${v.model}`
    }
    const outcome = (o: ExpiryOutcome) =>
      o.kind === 'renewedLate'
        ? t('pdf.outcome.renewedLate', { date: reportDate(o.renewedAt), days: o.lapsedDays })
        : t(`pdf.outcome.${o.kind}`)

    const docDefinition = buildFleetReportDocDefinition({
      // #103: a report narrowed to a site says so on every page.
      organizationName: site ? `${organization.name} · ${site.name}` : organization.name,
      strings: {
        title: t('pdf.title'),
        period: t('pdf.period', { from: reportDate(period.from), to: reportDate(period.to) }),
        generated: t('pdf.generated', { date: reportDate(now) }),
        tiles: { vehicles: t('pdf.tiles.vehicles'), running: t('pdf.tiles.running'), total: t('pdf.tiles.total'), jobs: t('pdf.tiles.jobs') },
        byVehicle: t('pdf.byVehicle'),
        byVehicleColumns: {
          vehicle: t('csv.vehicle'),
          drivers: t('pdf.drivers'),
          lines: t('pdf.lines'),
          running: t('pdf.tiles.running'),
          total: t('csv.total'),
        },
        byCategory: t('pdf.byCategory'),
        byCategoryColumns: { category: t('csv.costCategory'), lines: t('pdf.lines'), total: t('csv.total') },
        compliance: t('pdf.compliance'),
        expiries: t('pdf.expiries'),
        expiryColumns: { vehicle: t('csv.vehicle'), document: t('pdf.document'), date: t('pdf.expiredOn'), outcome: t('pdf.outcomeColumn') },
        renewals: t('pdf.renewals'),
        renewalColumns: {
          vehicle: t('csv.vehicle'),
          document: t('pdf.document'),
          date: t('pdf.renewedOn'),
          previous: t('pdf.previousExpiry'),
          next: t('pdf.newExpiry'),
        },
        noCosts: t('pdf.noCosts'),
        noExpiries: t('pdf.noExpiries'),
        noRenewals: t('pdf.noRenewals'),
        renewalsNote: t('pdf.renewalsNote'),
        footnote: t('pdf.footnote'),
        footer: t('pdf.footer', { organization: site ? `${organization.name} · ${site.name}` : organization.name, from: reportDate(period.from), to: reportDate(period.to) }),
      },
      vehicles: spend.vehicles.map((line) => ({
        name: shortName(line.vehicleId),
        detail: vehicleTitle(byId.get(line.vehicleId)!),
        drivers: line.drivers.join(', ') || '—',
        lines: line.lines,
        running: line.running,
        total: line.total,
      })),
      categories: spend.categories.map((c) => ({ label: to(`category.${c.category}`), lines: c.lines, total: c.total })),
      expiries: events.expiries.map((e) => ({
        vehicle: shortName(e.vehicleId),
        document: th(`doc.${e.type}`),
        date: reportDate(e.expiredOn),
        outcome: outcome(e.outcome),
      })),
      renewals: events.renewals.map((r) => ({
        vehicle: shortName(r.vehicleId),
        document: th(`doc.${r.type}`),
        date: r.lapsedDays > 0 ? `${reportDate(r.renewedAt)} · ${t('pdf.late', { days: r.lapsedDays })}` : reportDate(r.renewedAt),
        previous: reportDate(r.previousExpiry),
        next: reportDate(r.newExpiry),
      })),
      total: spend.total,
      running: spend.running,
      jobs,
    })

    const buffer = await renderPdf(docDefinition)
    return reportResponse(new Uint8Array(buffer), 'application/pdf', reportFilename(['Fleet', organization.name, ...(site ? [site.name] : [])], period, 'pdf'))
  } catch (e) {
    console.error('Fleet summary report failed:', e)
    return await apiError('reportFailed', 500)
  }
}
