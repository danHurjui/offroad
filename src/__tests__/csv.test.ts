import { csvField, toCsv, CSV_SEPARATOR } from '@/lib/csv'

// RL-041: the first CSV writer in the repo, so it sets the rules.
describe('csvField', () => {
  it.each(['=HYPERLINK("http://x","click")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1', '  =1+1'])(
    'makes %j text rather than a formula',
    (value) => {
      const field = csvField(value)
      expect(field.startsWith(`"'`)).toBe(true)
    }
  )

  it('leaves ordinary text and amounts alone', () => {
    expect(csvField('Schimb ulei')).toBe('"Schimb ulei"')
    expect(csvField('14.999,50')).toBe('"14.999,50"')
    expect(csvField('B 12 ABC')).toBe('"B 12 ABC"')
  })

  it('quotes every field and doubles quotes inside, so nothing moves a column', () => {
    expect(csvField('a "quoted"; b\nc')).toBe('"a ""quoted""; b\nc"')
  })

  it('writes an empty field for nothing', () => {
    expect(csvField(null)).toBe('""')
    expect(csvField(undefined)).toBe('""')
  })
})

describe('toCsv', () => {
  it('starts with a byte-order mark, separates with ; and ends lines with CRLF', () => {
    const csv = toCsv(['Data', 'Sumă (RON)'], [['01.03.2026', '14.999,50']])
    expect(CSV_SEPARATOR).toBe(';')
    expect(csv).toBe('\uFEFF"Data";"Sumă (RON)"\r\n"01.03.2026";"14.999,50"\r\n')
  })
})
