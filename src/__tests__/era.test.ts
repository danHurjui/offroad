import { yearMatchesEra } from '@/lib/era'

describe('yearMatchesEra', () => {
  it('matches everything when the era value is empty/unknown', () => {
    expect(yearMatchesEra(1955, '')).toBe(true)
    expect(yearMatchesEra(1955, 'not-a-real-era')).toBe(true)
  })

  it('matches pre1970 for anything before 1970', () => {
    expect(yearMatchesEra(1955, 'pre1970')).toBe(true)
    expect(yearMatchesEra(1970, 'pre1970')).toBe(false)
  })

  it('matches decade boundaries inclusively', () => {
    expect(yearMatchesEra(1970, '1970s')).toBe(true)
    expect(yearMatchesEra(1979, '1970s')).toBe(true)
    expect(yearMatchesEra(1980, '1970s')).toBe(false)
  })

  it('matches 2000s', () => {
    expect(yearMatchesEra(2005, '2000s')).toBe(true)
    expect(yearMatchesEra(2010, '2000s')).toBe(false)
  })
})
