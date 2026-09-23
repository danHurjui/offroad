import { renderPdf } from '@/lib/pdf'
import { buildFleetReportDocDefinition, type FleetReportInput } from '@/lib/pdfFleetReport'

const STRINGS: FleetReportInput['strings'] = {
  title: 'Raport flotă',
  period: '01.03.2026 – 31.03.2026',
  generated: 'Generat pe 01.04.2026',
  tiles: { vehicles: 'VEHICULE', jobs: 'LUCRĂRI', running: 'Cost de funcționare', total: 'Total' },
  byVehicle: 'Cheltuieli pe vehicul',
  byVehicleColumns: { vehicle: 'Vehicul', drivers: 'Șoferi', lines: 'Înregistrări', running: 'Funcționare', total: 'Total' },
  byCategory: 'Pe categorie',
  byCategoryColumns: { category: 'Categorie', lines: 'Înregistrări', total: 'Total' },
  compliance: 'Documente',
  expiries: 'Expirate',
  expiryColumns: { vehicle: 'Vehicul', document: 'Document', date: 'A expirat', outcome: 'De atunci' },
  renewals: 'Reînnoite',
  renewalColumns: { vehicle: 'Vehicul', document: 'Document', date: 'Reînnoit', previous: 'Era', next: 'Acum' },
  noCosts: 'Niciun cost.',
  noExpiries: 'Nimic.',
  noRenewals: 'Nicio reînnoire.',
  renewalsNote: 'Reînnoirile sunt cunoscute din septembrie 2026.',
  footnote: 'Nimic nu e estimat.',
  footer: 'RigLog · Transport Șerban SRL',
}

const input = (over: Partial<FleetReportInput> = {}): FleetReportInput => ({
  strings: STRINGS,
  organizationName: 'Transport Șerban SRL',
  vehicles: [{ name: 'CJ 10 ABC', detail: '2019 Dacia Dokker', drivers: 'Ana Pop, Bogdan Ionescu', lines: 3, running: 14999.5, total: 14999.5 }],
  categories: [{ label: 'Combustibil', lines: 3, total: 14999.5 }],
  expiries: [{ vehicle: 'CJ 10 ABC', document: 'RCA', date: '03.03.2026', outcome: 'Reînnoit pe 10.03.2026, cu 7 zile întârziere' }],
  renewals: [{ vehicle: 'CJ 10 ABC', document: 'RCA', date: '10.03.2026 · 7 zile întârziere', previous: '03.03.2026', next: '10.03.2027' }],
  total: 14999.5,
  running: 14999.5,
  jobs: 1,
  ...over,
})

// RL-041: the fleet summary on the shared engine, with the bundled Roboto
// so Romanian diacritics render.
describe('buildFleetReportDocDefinition', () => {
  it('renders a real PDF, diacritics and all', async () => {
    const buffer = await renderPdf(buildFleetReportDocDefinition(input()))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('renders with nothing in the period', async () => {
    const empty = input({ vehicles: [], categories: [], expiries: [], renewals: [], total: 0, running: 0, jobs: 0 })
    const doc = buildFleetReportDocDefinition(empty)
    expect(JSON.stringify(doc)).toContain('Niciun cost.')
    expect(JSON.stringify(doc)).toContain('Nicio reînnoire.')
    expect((await renderPdf(doc)).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('prints amounts the Romanian way and says how renewals are known', () => {
    const text = JSON.stringify(buildFleetReportDocDefinition(input()))
    expect(text).toContain('14.999,50 RON')
    expect(text).toContain('Reînnoirile sunt cunoscute din septembrie 2026.')
  })
})
