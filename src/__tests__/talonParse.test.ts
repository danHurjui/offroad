import fs from 'fs'
import path from 'path'
import { fuelFromTalon, isTalonComplete, mergeTalonProposals, parseTalon, readAnythingFromTalon } from '@/lib/talonParse'
import type { OcrLine } from '@/lib/ocrText'

const TODAY = new Date('2026-09-24T12:00:00Z')

/** A line as Tesseract returns it: words with a confidence, no geometry. */
function line(text: string, confidence = 95, low: string[] = []): OcrLine {
  return { words: text.split(/\s+/).map((word) => ({ text: word, confidence: low.includes(word) ? 40 : confidence })) }
}
const lines = (...texts: string[]) => texts.map((t) => line(t))

// The front of a Romanian talon, one code per row, as a clean read gives it.
const CLEAN = lines(
  'CERTIFICAT DE ÎNMATRICULARE',
  'A CJ 77 QZW',
  'B 12.03.2015',
  'C.1.1 POPESCU',
  'C.1.2 ION',
  'C.1.3 STR. EXEMPLU NR. 1 CLUJ-NAPOCA',
  'D.1 DACIA',
  'D.2 SD',
  'D.3 LOGAN',
  'E UU1LSDAAH53123456',
  'J M1',
  'P.1 1461',
  'P.2 66',
  'P.3 MOTORINĂ',
  'R ALB',
  'S.1 5'
)

describe('reading a talon', () => {
  it('reads every field by its code', () => {
    const p = parseTalon(CLEAN, TODAY)
    expect(p).toEqual({
      plate: { value: 'CJ 77 QZW', state: 'read' },
      firstRegistrationDate: { value: '2015-03-12', state: 'read' },
      make: { value: 'Dacia', state: 'read' },
      model: { value: 'Logan', state: 'read' },
      vin: { value: 'UU1LSDAAH53123456', state: 'read' },
      engineCapacityCc: { value: 1461, state: 'read' },
      powerKw: { value: 66, state: 'read' },
      fuelType: { value: 'DIESEL', state: 'read' },
      colour: { value: 'Alb', state: 'read' },
      seats: { value: 5, state: 'read' },
      hybridAmbiguous: false,
    })
    expect(isTalonComplete(p)).toBe(true)
  })

  it('never reads the holder: no name or address reaches any field', () => {
    const p = parseTalon(CLEAN, TODAY)
    expect(JSON.stringify(p)).not.toMatch(/POPESCU|Popescu|ION\b|EXEMPLU|CLUJ-NAPOCA/i)
  })

  it('stops at the next code when two columns come back as one row', () => {
    const p = parseTalon(lines('A B 123 ABC B 01.06.2019', 'D.1 VOLKSWAGEN D.2 AU D.3 GOLF', 'P.1 1968 P.2 110,00 P.3 BENZINA', 'R GRI S.1 5'), TODAY)
    expect(p.plate).toEqual({ value: 'B 123 ABC', state: 'read' })
    expect(p.firstRegistrationDate).toEqual({ value: '2019-06-01', state: 'read' })
    expect(p.make.value).toBe('Volkswagen')
    expect(p.model.value).toBe('Golf')
    expect([p.engineCapacityCc.value, p.powerKw.value, p.fuelType.value]).toEqual([1968, 110, 'PETROL'])
    expect([p.colour.value, p.seats.value]).toEqual(['Gri', 5])
  })

  it('takes a value printed under its code', () => {
    const p = parseTalon(lines('D.1', 'SKODA', 'D.3', 'OCTAVIA COMBI', 'E', 'TMBJJ7NE8H0123456'), TODAY)
    expect([p.make.value, p.model.value, p.vin.value]).toEqual(['Skoda', 'Octavia Combi', 'TMBJJ7NE8H0123456'])
  })

  it('tolerates the misreads a dot and a 1 suffer', () => {
    const p = parseTalon(lines('D1 FORD', 'D,3 FOCUS', 'P.l 999', 'S.I 5'), TODAY)
    expect([p.make.value, p.model.value, p.engineCapacityCc.value, p.seats.value]).toEqual(['Ford', 'Focus', 999, 5])
  })

  it('repairs O, I and Q in a VIN (it never holds them), and refuses what is still not one', () => {
    expect(parseTalon(lines('E UU1LSDAAH53I23O56'), TODAY).vin).toEqual({ value: 'UU1LSDAAH53123056', state: 'read' })
    expect(parseTalon(lines('E UU1LSDA'), TODAY).vin.state).toBe('unsure')
  })

  it('finds a plate-shaped string with a real county code even without its A', () => {
    expect(parseTalon(lines('NR. INMATRICULARE', 'IS 12 XYZ'), TODAY).plate).toEqual({ value: 'IS 12 XYZ', state: 'read' })
    // ZZ is no county: not a plate.
    expect(parseTalon(lines('ZZ 12 XYZ'), TODAY).plate.state).toBe('missing')
  })
})

describe('what it refuses to guess', () => {
  it('a word read with low confidence is left empty and flagged', () => {
    const p = parseTalon([line('D.1 DACIA'), line('E UU1LSDAAH53123456', 95, ['UU1LSDAAH53123456']), line('P.1 1461', 95, ['1461'])], TODAY)
    expect(p.make.state).toBe('read')
    expect(p.vin).toEqual({ value: null, state: 'unsure' })
    expect(p.engineCapacityCc).toEqual({ value: null, state: 'unsure' })
  })

  it('a hybrid is not picked for the owner: it may be a plug-in', () => {
    const p = parseTalon(lines('P.3 BENZINA/ELECTRIC'), TODAY)
    expect(p.fuelType).toEqual({ value: null, state: 'unsure' })
    expect(p.hybridAmbiguous).toBe(true)
    expect(readAnythingFromTalon(p)).toBe(true)
  })

  it('maps the fuels the talon prints', () => {
    expect(fuelFromTalon('BENZINA')).toBe('PETROL')
    expect(fuelFromTalon('MOTORINA')).toBe('DIESEL')
    expect(fuelFromTalon('BENZINA/GPL')).toBe('LPG')
    expect(fuelFromTalon('ELECTRIC')).toBe('ELECTRIC')
    expect(fuelFromTalon('HIBRID BENZINA')).toBe('HYBRID_AMBIGUOUS')
    expect(fuelFromTalon('XYZ')).toBeNull()
  })

  it('a first-registration date in the future, or impossible, is not proposed', () => {
    expect(parseTalon(lines('B 12.03.2031'), TODAY).firstRegistrationDate.state).toBe('unsure')
    expect(parseTalon(lines('B 31.02.2015'), TODAY).firstRegistrationDate.state).toBe('unsure')
  })

  it('an engine size or power outside what a vehicle can have is not proposed', () => {
    const p = parseTalon(lines('P.1 146100', 'P.2 0'), TODAY)
    expect([p.engineCapacityCc.state, p.powerKw.state]).toEqual(['unsure', 'unsure'])
  })

  it('never proposes a year: B is the first registration, not the model year', () => {
    expect(Object.keys(parseTalon(CLEAN, TODAY))).not.toContain('year')
  })

  it('reading nothing says so', () => {
    const p = parseTalon(lines('ceva', 'altceva'), TODAY)
    expect(readAnythingFromTalon(p)).toBe(false)
    expect(isTalonComplete(p)).toBe(false)
  })
})

describe('two looks at one card', () => {
  it('keeps a field read once, and flags one read two different ways', () => {
    const first = parseTalon(lines('A CJ 77 QZW', 'D.1 DACIA'), TODAY)
    const second = parseTalon(lines('A CJ 77 QZW', 'D.1 DAC1A', 'D.3 LOGAN'), TODAY)
    const merged = mergeTalonProposals(first, second)
    expect(merged.plate.value).toBe('CJ 77 QZW')
    expect(merged.model.value).toBe('Logan')
    expect(merged.make.state).toBe('unsure')
  })
})

describe('the talon scan on the page', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

  it('is loaded only when somebody scans, and never uploads the photo', () => {
    const source = read('src/components/TalonScan.tsx')
    expect(source).toContain("await import('@/lib/ocr')")
    expect(source).not.toMatch(/fetch\(|FormData/)
  })

  // The owner's decision: the talon scan is free on every plan.
  it('is free: no plan gate on the page or the component', () => {
    expect(read('src/app/dashboard/vehicles/[id]/edit/page.tsx')).not.toMatch(/vehicleHasPro|canScan/)
    expect(read('src/components/TalonScan.tsx')).not.toMatch(/canScan|upgrade/)
  })
})
