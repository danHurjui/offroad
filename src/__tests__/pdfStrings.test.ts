import { translator } from '@/i18n/translator'
import { LOCALES, type Locale } from '@/i18n/config'
import { PROJECT_TYPES } from '@/lib/projectType'
import { buildVehicleHistoryDocDefinition } from '@/lib/pdfBuildHistory'
import { buildJobReportDocDefinition } from '@/lib/pdfJobReport'

/**
 * The PDF builders are pure and take their wording from the caller, so
 * what has to be checked is the other half: that the catalogue actually
 * has a sentence for every label the routes ask for, in both languages.
 *
 * Read the real catalogue rather than a fixture — a key added to the
 * builder and forgotten in messages/ro.json would otherwise print
 * `pdf.purchasePrice` into somebody's exported build history, and nothing
 * else would catch it. (The rendered PDF cannot be grepped: pdfmake
 * writes text as glyph indices into an embedded font subset.)
 */

/** Exactly the keys src/app/api/vehicles/[id]/export/pdf/route.ts looks up. */
const HISTORY_KEYS = [
  'generation',
  'engine',
  'vin',
  'foundState',
  'acquired',
  'purchasePrice',
  'odometer',
  'condition',
  'workshop',
  'diy',
] as const

/** …and the job report's. */
const JOB_REPORT_KEYS = [
  'jobReportTitle',
  'preparedBy',
  'period',
  'noTasks',
  'documentedWith',
  'last30Days',
  'allTime',
] as const

const PLACEHOLDER_KEYS: Record<string, Record<string, string | number>> = {
  progress: { label: 'Build progress', percent: 42 },
  totalSpent: { total: '12.500 RON' },
  generatedOn: { date: '15.01.2026' },
  totalLabour: { total: '150 RON' },
  totalParts: { total: '200 RON' },
  taskMeta: { date: '15.01.2026', category: 'Brakes', parts: '200 RON', labour: '150 RON' },
}

describe('the PDF vocabulary', () => {
  it.each(LOCALES)('%s has every label the exports ask for', async (locale) => {
    const t = await translator(locale as Locale, 'pdf')

    for (const key of [...HISTORY_KEYS, ...JOB_REPORT_KEYS]) {
      expect({ locale, key, value: t(key) }).toMatchObject({ value: expect.stringMatching(/\S/) })
      expect(t(key)).not.toContain('pdf.')
    }

    // One subtitle per mode — a new mode without one would print the key.
    for (const projectType of PROJECT_TYPES) {
      expect(t(`subtitle.${projectType}`)).toMatch(/\S/)
    }
  })

  it.each(LOCALES)('%s resolves every placeholder it is given', async (locale) => {
    const t = await translator(locale as Locale, 'pdf')

    for (const [key, values] of Object.entries(PLACEHOLDER_KEYS)) {
      const rendered = t(key, values)
      // An unsupplied placeholder survives as `{name}` and would be
      // printed literally into the document.
      expect({ key, locale, rendered }).toMatchObject({
        rendered: expect.not.stringMatching(/\{\w+\}/),
      })
      for (const value of Object.values(values)) {
        expect(rendered).toContain(String(value))
      }
    }
  })
})

/**
 * End to end through the builder: the same document, built twice, has to
 * differ — otherwise a label is hardcoded somewhere rather than coming
 * from the strings it was handed.
 */
describe('a built document', () => {
  async function history(locale: Locale) {
    const t = await translator(locale, 'pdf')
    return JSON.stringify(
      buildVehicleHistoryDocDefinition({
        strings: {
          subtitle: t('subtitle.DAILY_DRIVER'),
          generation: t('generation'),
          engine: t('engine'),
          vin: t('vin'),
          summary: t('progress', { label: 'Jobs logged', percent: 100 }),
          totalSpent: t('totalSpent', { total: '350 RON' }),
          foundState: t('foundState'),
          acquired: t('acquired'),
          purchasePrice: t('purchasePrice'),
          odometer: t('odometer'),
          condition: t('condition'),
          workshop: t('workshop'),
          diy: t('diy'),
          generatedOn: t('generatedOn', { date: '15.01.2026' }),
        },
        vehicleName: '2018 Dacia Logan',
        projectType: 'DAILY_DRIVER',
        generation: 'Mk2',
        engine: '1.5 dCi',
        vin: null,
        coverPhotoDataUri: null,
        progressLabel: 'Jobs logged',
        progressPct: 100,
        totalSpent: 350,
        categories: [
          {
            categoryLabel: 'Brakes',
            tasks: [
              {
                name: 'Front pads',
                brand: null,
                statusLabel: 'Done',
                date: new Date('2026-01-15'),
                workType: 'WORKSHOP',
                totalCost: 350,
                workshopName: 'Service Ionescu',
                notes: null,
                photos: [],
              },
            ],
          },
        ],
        foundState: null,
        generatedAt: new Date('2026-01-15'),
      })
    )
  }

  it('says something different in each language', async () => {
    const ro = await history('ro')
    const en = await history('en')
    expect(ro).not.toBe(en)
    expect(en).toContain('Service & repair history')
    expect(ro).toContain('Istoric de service')
  })

  it('leaves no dotted key or unresolved placeholder in the output', async () => {
    for (const locale of LOCALES) {
      const doc = await history(locale as Locale)
      expect(doc).not.toMatch(/"pdf\.\w+/)
      expect(doc).not.toMatch(/\{(total|label|percent|date|category|parts|labour)\}/)
    }
  })

  // The job report is always free, unlike the build history, so it has to
  // hold up on its own.
  it('builds a job report in each language too', async () => {
    const built = await Promise.all(
      LOCALES.map(async (locale) => {
        const t = await translator(locale as Locale, 'pdf')
        return JSON.stringify(
          buildJobReportDocDefinition({
            strings: {
              title: t('jobReportTitle'),
              preparedBy: t('preparedBy'),
              period: t('period'),
              totalLabour: (total) => t('totalLabour', { total: `${total} RON` }),
              totalParts: (total) => t('totalParts', { total: `${total} RON` }),
              noTasks: t('noTasks'),
              documentedWith: t('documentedWith'),
              taskMeta: (task) =>
                t('taskMeta', {
                  date: '15.01.2026',
                  category: task.category,
                  parts: `${task.partsCostRon} RON`,
                  labour: `${task.labourCostRon} RON`,
                }),
            },
            collaboratorName: 'Service Ionescu',
            vehicleName: '2018 Dacia Logan',
            rangeLabel: t('allTime'),
            tasks: [
              {
                name: 'Front pads',
                category: 'Brakes',
                date: new Date('2026-01-15'),
                workType: 'WORKSHOP',
                partsCostRon: 200,
                labourCostRon: 150,
                photos: [],
              },
            ],
            generatedAt: new Date('2026-01-15'),
          })
        )
      })
    )

    expect(built[0]).not.toBe(built[1])
    // The builder still does its own summing; only the wording comes in.
    for (const doc of built) expect(doc).toContain('150 RON')
  })
})
