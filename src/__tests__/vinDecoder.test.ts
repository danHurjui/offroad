import { isValidVinFormat, decodeModelYear, decodeVin, decodeViaNhtsa } from '@/lib/vinDecoder'

// Built by concatenation (not typed out long-hand) so lengths are exact:
// WMI(3) + VDS(5) + position-9 check char = 9 chars, then the position-10
// model-year char, then 7 more VIS chars = 17 total.
const DACIA_PREFIX = 'UU1BSDAAH' // 9 chars, Dacia WMI (UU1)
const VIS_SUFFIX = '1234567' // 7 chars
function vinWithYearChar(char: string): string {
  return `${DACIA_PREFIX}${char}${VIS_SUFFIX}`
}
const DACIA_VIN = vinWithYearChar('A') // 17 chars total

describe('isValidVinFormat', () => {
  it('accepts a well-formed 17-char VIN', () => {
    expect(isValidVinFormat(DACIA_VIN)).toBe(true)
  })

  it('rejects a VIN that is not exactly 17 characters', () => {
    expect(isValidVinFormat(`${DACIA_VIN}X`)).toBe(false)
    expect(isValidVinFormat(DACIA_PREFIX)).toBe(false)
  })

  it('rejects VINs containing I, O, or Q', () => {
    expect(isValidVinFormat(vinWithYearChar('I'))).toBe(false)
    expect(isValidVinFormat(vinWithYearChar('O'))).toBe(false)
    expect(isValidVinFormat(vinWithYearChar('Q'))).toBe(false)
  })
})

describe('decodeModelYear', () => {
  it('picks the 30-year-cycle candidate closest to a known year', () => {
    // 'A' => 1980 or 2010; a vehicle recorded as ~2012 should resolve to 2010.
    expect(decodeModelYear(DACIA_VIN, 2012)).toBe(2010)
  })

  it('resolves the other cycle when the known year is older', () => {
    expect(decodeModelYear(DACIA_VIN, 1982)).toBe(1980)
  })

  it('defaults to the most recent non-future cycle without a known year', () => {
    const result = decodeModelYear(DACIA_VIN)
    expect(result).not.toBeNull()
    expect(result! % 30).toBe(1980 % 30)
  })

  it('returns null when position 10 is not a year-code character', () => {
    expect(decodeModelYear(vinWithYearChar('I'))).toBeNull()
  })
})

describe('decodeVin — local Dacia path', () => {
  it('decodes a Dacia (UU1 WMI) VIN without hitting the network', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const result = await decodeVin(DACIA_VIN, 2010)
    expect(result?.source).toBe('local')
    expect(result?.decoded.manufacturer).toBe('Dacia')
    expect(result?.decoded.factory).toBe('Mioveni, Romania')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('never fabricates a colour code', async () => {
    const result = await decodeVin(DACIA_VIN, 2010)
    expect(result?.decoded.colorCode).toBeNull()
  })

  it('returns null for an invalid format instead of throwing', async () => {
    expect(await decodeVin('not-a-vin')).toBeNull()
  })
})

describe('decodeViaNhtsa', () => {
  const REAL_FETCH = global.fetch

  afterEach(() => {
    global.fetch = REAL_FETCH
  })

  it('maps a successful NHTSA response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Results: [{ Make: 'FORD', ModelYear: '2015', PlantCountry: 'UNITED STATES', BodyClass: 'Sedan' }],
      }),
    }) as never

    const result = await decodeViaNhtsa('1'.repeat(17))
    expect(result?.manufacturer).toBe('FORD')
    expect(result?.modelYear).toBe(2015)
    expect(result?.colorCode).toBeNull()
  })

  it('returns null when NHTSA has no Make (undecodable)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ Results: [{}] }) }) as never
    expect(await decodeViaNhtsa('1'.repeat(17))).toBeNull()
  })

  it('returns null instead of throwing on a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as never
    expect(await decodeViaNhtsa('1'.repeat(17))).toBeNull()
  })
})
