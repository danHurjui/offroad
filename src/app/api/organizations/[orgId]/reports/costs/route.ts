import { NextRequest } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { loadOwnershipInputs } from '@/lib/ownershipRecords'
import { costRows } from '@/lib/fleetReport'
import { toCsv } from '@/lib/csv'
import { formatAmount } from '@/lib/money'
import { costLineLabeller, loadReport, reportDate, reportFilename, reportResponse, vehicleTitle } from '../load'

// RL-041: every cost of every vehicle (or one) in a period — the lines on
// each vehicle's costs page — with who was driving it that day, so a
// vehicle's spend can be read against its drivers.
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
    const label = await costLineLabeller(locale)
    const inputs = await loadOwnershipInputs(vehicles, new Date())
    const rows = costRows(vehicles.map((v) => inputs.get(v.id)!), assignments, period)

    const byId = new Map(vehicles.map((v) => [v.id, v]))
    const csv = toCsv(
      [t('csv.vehicle'), t('csv.registration'), t('csv.date'), t('csv.costCategory'), t('csv.item'), t('csv.note'), t('csv.amount'), t('csv.driver')],
      rows.map((row) => {
        const vehicle = byId.get(row.vehicleId)!
        return [
          vehicleTitle(vehicle),
          vehicle.plate,
          reportDate(row.date),
          to(`category.${row.category}`),
          label(row),
          row.text,
          formatAmount(row.amount),
          row.drivers.join(' / '),
        ]
      })
    )
    const one = req.nextUrl.searchParams.get('vehicle') ? vehicles[0] : null
    const parts = ['Costs', organization.name, ...(site ? [site.name] : []), ...(one ? [one.plate ?? `${one.make} ${one.model}`] : [])]
    return reportResponse(csv, 'text/csv; charset=utf-8', reportFilename(parts, period, 'csv'))
  } catch (e) {
    console.error('Fleet cost report failed:', e)
    return await apiError('reportFailed', 500)
  }
}
