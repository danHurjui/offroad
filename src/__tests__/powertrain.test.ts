import fs from 'fs'
import path from 'path'
import { FUEL_TYPES } from '@/lib/vehicleProfile'
import { POWERTRAINS, hasEngine, powertrainOf, takesCharge, takesFuel } from '@/lib/powertrain'

describe('powertrainOf', () => {
  it.each([
    ['PETROL', 'COMBUSTION'],
    ['DIESEL', 'COMBUSTION'],
    ['LPG', 'COMBUSTION'],
    ['HYBRID', 'HYBRID'],
    ['PLUGIN_HYBRID', 'PLUGIN_HYBRID'],
    ['ELECTRIC', 'ELECTRIC'],
    ['OTHER', 'UNKNOWN'],
  ])('%s is %s', (fuel, powertrain) => {
    expect(powertrainOf(fuel)).toBe(powertrain)
  })

  it('covers every fuel type the profile accepts', () => {
    for (const fuel of FUEL_TYPES) expect(POWERTRAINS).toContain(powertrainOf(fuel))
  })

  it('treats no fuel type, and anything unrecognised, as unknown', () => {
    expect(powertrainOf(null)).toBe('UNKNOWN')
    expect(powertrainOf(undefined)).toBe('UNKNOWN')
    expect(powertrainOf('')).toBe('UNKNOWN')
    expect(powertrainOf('HYDROGEN')).toBe('UNKNOWN')
  })
})

describe('what each powertrain takes', () => {
  it('keeps every vehicle without a fuel type on the fuel log, as before RL-052', () => {
    expect(takesFuel('UNKNOWN')).toBe(true)
    expect(takesCharge('UNKNOWN')).toBe(false)
    expect(hasEngine('UNKNOWN')).toBe(true)
  })

  it('gives a regular hybrid fuel only — it never plugs in', () => {
    expect(takesFuel('HYBRID')).toBe(true)
    expect(takesCharge('HYBRID')).toBe(false)
  })

  it('gives a plug-in hybrid both', () => {
    expect(takesFuel('PLUGIN_HYBRID')).toBe(true)
    expect(takesCharge('PLUGIN_HYBRID')).toBe(true)
    expect(hasEngine('PLUGIN_HYBRID')).toBe(true)
  })

  it('gives an electric vehicle charge only, and no engine', () => {
    expect(takesFuel('ELECTRIC')).toBe(false)
    expect(takesCharge('ELECTRIC')).toBe(true)
    expect(hasEngine('ELECTRIC')).toBe(false)
  })

  it('gives combustion fuel only', () => {
    expect(takesFuel('COMBUSTION')).toBe(true)
    expect(takesCharge('COMBUSTION')).toBe(false)
  })
})

/**
 * The reason the module exists: a screen that compares `fuelType` itself
 * handles the one value its author thought of, and a plug-in hybrid — which
 * takes fuel *and* a charge — is exactly the case that gets missed.
 */
describe('no file decides by fuelType on its own', () => {
  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : files(full)
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
    })
  }

  it('compares fuelType to a literal only in powertrain.ts', () => {
    const offenders = files(path.join(process.cwd(), 'src'))
      .filter((file) => !file.endsWith(path.join('lib', 'powertrain.ts')))
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8')
        return /fuelType\s*[!=]==?\s*['"`]/.test(source) || /['"`]\s*[!=]==?\s*\w*\.?fuelType\b/.test(source)
      })
      .map((file) => path.relative(process.cwd(), file))
    expect(offenders).toEqual([])
  })
})
