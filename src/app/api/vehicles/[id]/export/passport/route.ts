import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { labelFor } from '@/lib/projectType'
import { translateConfig } from '@/lib/vocabulary'
import { renderPdf, pdfFilename } from '@/lib/pdf'
import { buildPassportDocDefinition } from '@/lib/pdfPassport'
import { loadPassport } from '@/lib/passportRecords'
import type { ServiceRow } from '@/lib/serviceBook'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-049: the passport as a dated PDF snapshot. Owner only and Pro. It
// carries the same choices (plate, VIN, costs) as the live link, or the
// safe defaults when there is none.
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (!hasPro(owner)) return await apiError('proPassport', 403, { code: 'UPGRADE_REQUIRED' })

  try {
    const locale = localeFromRequest()
    const t = await translator(locale, 'passport')
    const th = await translator(locale, 'health')
    const tt = await translator(locale, 'tyres')
    const ta = await translator(locale, 'accidents')
    const config = translateConfig(vehicle.projectType, await translator(locale, 'vocab'))
    const active = await prisma.passportLink.findFirst({ where: { vehicleId: vehicle.id, revokedAt: null }, orderBy: { createdAt: 'desc' } })
    const now = new Date()
    const { passport: p } = await loadPassport(vehicle, active ?? { showPlate: false, showVin: false, showCosts: true }, now)
    const date = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })
    const km = (n: number) => `${n.toLocaleString('ro-RO')} km`

    const docDefinition = buildPassportDocDefinition(p, {
      title: t('title'),
      what: t('what'),
      ownerView: t('ownerView'),
      ownerViewAdvice: t('ownerViewAdvice'),
      tilesTitle: t('summary'),
      snapshot: t('snapshot', { date: date(now) }),
      identity: [p.plate && t('plateLine', { plate: p.plate }), p.vin && `VIN ${p.vin}`].filter(Boolean).join('  ·  ') || null,
      tiles: [
        { label: t(p.span.fromPurchase ? 'ownedSince' : 'recordsSince'), value: date(p.span.from) },
        { label: t('latestKm'), value: p.mileage.latest ? km(p.mileage.latest.km) : t('none') },
        { label: t('jobs'), value: String(p.jobs.count) },
        ...(p.jobs.spend !== null ? [{ label: t('spendLabel'), value: `${p.jobs.spend.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} RON` }] : []),
      ],
      missingTitle: t('missingTitle'),
      missing: [
        ...p.gaps.map((g) => t('gap', { from: date(g.from), to: date(g.to), days: g.days })),
        ...p.absences.map((m) => t(m.key, m.values ?? {})),
        ...(p.mileage.resets > 0 ? [t('resets', { count: p.mileage.resets })] : []),
      ],
      historyTitle: t('historyTitle'),
      datesRule: t('datesRule'),
      columns: { date: t('col.date'), km: t('col.km'), work: t('col.work'), cost: t('col.cost') },
      detail: (row: ServiceRow) =>
        [labelFor(config.categories, row.category), row.parts, row.workType === 'WORKSHOP' ? row.workshop ?? t('workshop') : t('diy')]
          .filter(Boolean)
          .join('  ·  '),
      recorded: (row: ServiceRow) =>
        [
          t('recordedOn', { date: date(row.recordedAt) }),
          row.changedAt && t('changedOn', { date: date(row.changedAt) }),
          row.flags.some((f) => f.kind === 'odometerReset') && t('kmRestarts'),
        ]
          .filter(Boolean)
          .join('  ·  '),
      noJobs: t('absence.noJobs'),
      documentsTitle: t('documentsTitle'),
      documents: p.documents.length
        ? [...p.documents.map((d) => `${th(`doc.${d.type}`)} — ${t(`docStatus.${d.status}`, { date: date(d.expiryDate) })}`), t('documentsNote')]
        : [t('absence.noDocuments')],
      tyresLine:
        vehicle.projectType === 'RESTORATION'
          ? null
          : p.tyres.count === 0
            ? t('absence.noTyres')
            : `${t('tyresTitle')}: ${t('tyreSets', { count: p.tyres.count })}${p.tyres.fitted ? ` · ${t('fitted', { season: tt(`season.${p.tyres.fitted.season}`), label: p.tyres.fitted.label ?? '', dot: p.tyres.fitted.dotYear ?? '' })}` : ''}`,
      accidentsTitle: t('accidentsTitle'),
      accidentsNote: t('accidentsNote'),
      accidents: p.accidents.map((a) => ({
        heading: [date(a.date), a.km !== null ? km(a.km) : null, ta(`kind.${a.kind}`)].filter(Boolean).join('  ·  '),
        description: a.description,
        detail: [
          a.insurance && t(`accidentInsurance.${a.insurance}`),
          a.repairedAt ? t('accidentRepaired', { date: date(a.repairedAt) }) : t('accidentNotRepaired'),
          a.repairCost !== null && t('accidentCost', { amount: `${a.repairCost.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} RON` }),
          a.photoCount > 0 && t('accidentPhotos', { count: a.photoCount }),
          t('recordedOn', { date: date(a.recordedAt) }),
          a.changedAt && t('changedOn', { date: date(a.changedAt) }),
        ]
          .filter(Boolean)
          .join('  ·  '),
      })),
      noAccidents: t('absence.noAccidentsRecorded'),
      footer: t('footerPdf', { date: date(now) }),
    })

    const buffer = await renderPdf(docDefinition)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename('RigLog_Passport', `${vehicle.year} ${vehicle.make} ${vehicle.model}`)}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (e) {
    console.error('Passport export failed:', e)
    return await apiError('passportFailed', 500)
  }
}
