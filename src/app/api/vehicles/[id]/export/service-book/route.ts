import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { labelFor } from '@/lib/projectType'
import { translateConfig } from '@/lib/vocabulary'
import { renderPdf, pdfFilename } from '@/lib/pdf'
import { buildServiceBookDocDefinition } from '@/lib/pdfServiceBook'
import { loadServiceBook } from '@/lib/serviceBookRecords'
import type { ServiceRow } from '@/lib/serviceBook'
import { vehicleHasPro } from '@/lib/entitlement'

// RL-047: the service book as a PDF. Owner only and Pro, consistent with
// RL-014's export; reading the book on screen stays free.
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  if (!(await vehicleHasPro(vehicle))) return await apiError('proServiceBookExport', 403, { code: 'UPGRADE_REQUIRED' })

  try {
    const locale = localeFromRequest()
    const config = translateConfig(vehicle.projectType, await translator(locale, 'vocab'))
    const t = await translator(locale, 'serviceBook')
    const book = await loadServiceBook(vehicle.id, config.completeStatus)
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    const date = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

    const docDefinition = buildServiceBookDocDefinition({
      strings: {
        title: t('pdfTitle'),
        entries: t('entries'),
        total: t('total'),
        generated: t('generated'),
        columns: { date: t('col.date'), km: t('col.km'), work: t('col.work'), cost: t('col.cost') },
        provenance: t('provenance'),
        noEntries: t('empty'),
        ownerView: t('ownerView'),
        footer: t('footerPdf'),
        detail: (row: ServiceRow) =>
          [
            labelFor(config.categories, row.category),
            row.parts && t('partsValue', { parts: row.parts }),
            row.workType === 'WORKSHOP' ? row.workshop ?? t('workshop') : t('diy'),
          ]
            .filter(Boolean)
            .join('  ·  '),
        notes: (row: ServiceRow) =>
          [
            ...row.flags.map((f) =>
              f.kind === 'loggedLate'
                ? t('flag.loggedLate', { date: date(f.loggedOn) })
                : f.kind === 'odometerReset'
                  ? t('flag.odometerReset')
                  : t('flag.kmBelowEarlier', { km: f.earlierKm.toLocaleString('ro-RO') })
            ),
            row.receiptUrl ? t('receiptOnFile') : null,
          ]
            .filter(Boolean)
            .join('  ·  '),
      },
      vehicleName,
      rows: book.rows,
      total: book.total,
      generatedAt: new Date(),
    })

    const buffer = await renderPdf(docDefinition)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename('RigLog_ServiceBook', vehicleName)}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (e) {
    console.error('Service book export failed:', e)
    return await apiError('serviceBookFailed', 500)
  }
}
