import fs from 'fs'
import path from 'path'
import { formatAmount, formatRon } from '@/lib/money'

// RL-041: one way to write RON, the Romanian one, for exports and screens.
describe('formatRon / formatAmount', () => {
  it('writes the ticket’s example the Romanian way', () => {
    expect(formatRon(14999.5)).toBe('14.999,50 RON')
  })

  it('groups thousands with a dot and always prints the bani', () => {
    expect(formatAmount(1234)).toBe('1.234,00')
    expect(formatAmount(1234567.891)).toBe('1.234.567,89')
    expect(formatAmount(5)).toBe('5,00')
  })

  it('rounds to whole lei when asked', () => {
    expect(formatRon(1234.5, 0)).toBe('1.235 RON')
  })

  it('never prints a negative zero', () => {
    expect(formatAmount(-0)).toBe('0,00')
  })
})

/**
 * #105: one way to write RON. A hand-built `${…} RON` or `{…} RON` is how
 * the app ended up printing `14.99 RON` on one screen and `14.999,50 RON`
 * on the next — the same failure the NEXTAUTH_URL test guards for appUrl.
 */
describe('nothing outside money.ts writes RON by hand', () => {
  // Each with its reason. Plan prices are written by formatPlanPrice(),
  // which the whole pricing ladder shares and which drops ",00" from 99.
  const ALLOWED = new Set(['src/lib/money.ts', 'src/app/dashboard/upgrade/page.tsx'])

  function* sources(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') yield* sources(full)
      } else if (/\.tsx?$/.test(entry.name)) {
        yield full
      }
    }
  }

  it('finds none', () => {
    const offenders: string[] = []
    for (const file of sources(path.join(process.cwd(), 'src'))) {
      const rel = path.relative(process.cwd(), file).split(path.sep).join('/')
      if (ALLOWED.has(rel)) continue
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\}\s*RON\b/.test(code)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
