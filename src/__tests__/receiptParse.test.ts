import { MIN_CONFIDENCE, parseFuelReceipt, parseReceiptNumber, readAnything, type OcrLine } from '@/lib/receiptParse'

/**
 * RL-048: what the fuel form is offered from a scanned receipt. The
 * receipts are written the way Tesseract returns them — words with a
 * confidence each — laid out like the real ones from the chains.
 */

const TODAY = new Date('2026-09-23T12:00:00Z')

/** A receipt from text, every word read at `confidence` unless marked `word@40`. */
function receipt(text: string, confidence = 95): OcrLine[] {
  return text
    .trim()
    .split('\n')
    .map((line) => ({
      words: line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => {
          const [word, conf] = token.split('@')
          return { text: word, confidence: conf ? Number(conf) : confidence }
        }),
    }))
}

const OMV = `
OMV
OMV PETROM MARKETING SRL
CIF: RO11201891
STATIA PITESTI 2
BENZINA OMV 95
32,45 L x 7,19 LEI/L
233,32 B
TOTAL LEI 233,32
TOTAL TVA 37,25
CARD 233,32
DATA: 12.09.2026 ORA: 14:22
`

describe('parseReceiptNumber', () => {
  it.each([
    ['233,32', 233.32],
    ['233.32', 233.32],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['32,450', 32.45],
    ['7', 7],
    ['2O3,5O', 203.5],
  ])('%s → %s', (raw, value) => {
    expect(parseReceiptNumber(raw)).toBe(value)
  })

  it.each(['', 'abc', '12,', ',5', '1..2'])('refuses %p', (raw) => {
    expect(parseReceiptNumber(raw)).toBeNull()
  })
})

describe('parseFuelReceipt', () => {
  it('reads an OMV receipt: date, station, litres, price and total', () => {
    const p = parseFuelReceipt(receipt(OMV), TODAY)
    expect(p.date).toEqual({ value: '2026-09-12', state: 'read' })
    expect(p.station).toEqual({ value: 'OMV', state: 'read' })
    expect(p.litres).toEqual({ value: 32.45, state: 'read' })
    expect(p.pricePerLitre).toEqual({ value: 7.19, state: 'read' })
    expect(p.totalRon).toEqual({ value: 233.32, state: 'read' })
    expect(readAnything(p)).toBe(true)
  })

  it('never takes the VAT line for the total', () => {
    const p = parseFuelReceipt(receipt('TOTAL TVA 37,25\nTOTAL 233,32'), TODAY)
    expect(p.totalRon.value).toBe(233.32)
  })

  it('a Petrom station prints the company name; it is Petrom, not OMV', () => {
    const p = parseFuelReceipt(receipt('OMV PETROM MARKETING SRL\nPETROM\nTOTAL 100,00'), TODAY)
    expect(p.station.value).toBe('Petrom')
  })

  it('the company line alone does not make an OMV receipt a Petrom one', () => {
    const p = parseFuelReceipt(receipt('OMV@40\nOMV PETROM MARKETING SRL\nTOTAL 100,00'), TODAY)
    // The logo was doubtful and nothing else names the brand.
    expect(p.station).toEqual({ value: null, state: 'unsure' })
  })

  it('a confident brand line lower in the header wins over a doubtful logo', () => {
    const p = parseFuelReceipt(receipt('L0G0@30 LUK0IL@40\nLUKOIL ROMANIA SRL'), TODAY)
    expect(p.station).toEqual({ value: 'Lukoil', state: 'read' })
  })

  it.each([
    ['ROMPETROL DOWNSTREAM SRL', 'Rompetrol'],
    ['LUKOIL ROMANIA SRL', 'Lukoil'],
    ['MOL ROMANIA PETROLEUM PRODUCTS', 'MOL'],
    ['M0L ROMANIA', 'MOL'],
    ['SOCAR PETROLEUM SA', 'Socar'],
    ['0MV', 'OMV'],
  ])('station from %p', (header, name) => {
    expect(parseFuelReceipt(receipt(header), TODAY).station.value).toBe(name)
  })

  it('reads labelled quantities and a price in LEI/L', () => {
    const p = parseFuelReceipt(
      receipt(`
LUKOIL
MOTORINA
CANTITATE: 40,00
PRET UNITAR: 7,50
TOTAL RON 300,00
      `),
      TODAY
    )
    expect(p.litres.value).toBe(40)
    expect(p.pricePerLitre.value).toBe(7.5)
    expect(p.totalRon.value).toBe(300)
  })

  it('reads litres and a price with no × between them', () => {
    const p = parseFuelReceipt(receipt('DIESEL 50,000 LITRI\n7,20 LEI/L\nTOTAL 360,00'), TODAY)
    expect(p.litres.value).toBe(50)
    expect(p.pricePerLitre.value).toBe(7.2)
  })

  describe('dates', () => {
    it.each([
      ['DATA 12/09/2026', '2026-09-12'],
      ['12-09-26 10:11', '2026-09-12'],
      ['2026-09-12', '2026-09-12'],
      ['12 septembrie 2026', '2026-09-12'],
      ['12 SEP 2026', '2026-09-12'],
      ['3 noiembrie 2025', '2025-11-03'],
      ['1 martie 2026', '2026-03-01'],
    ])('%p → %s', (line, day) => {
      expect(parseFuelReceipt(receipt(line), TODAY).date).toEqual({ value: day, state: 'read' })
    })

    it('skips a date in the future (a validity date) and takes the real one', () => {
      const p = parseFuelReceipt(receipt('VALABIL PANA LA 31.12.2027\nDATA 12.09.2026'), TODAY)
      expect(p.date.value).toBe('2026-09-12')
    })

    it('an impossible date is not a date', () => {
      expect(parseFuelReceipt(receipt('31.02.2026'), TODAY).date.state).toBe('missing')
    })
  })

  describe('low confidence is empty-and-flagged, never a guess', () => {
    it('a smudged total is unsure, with no value', () => {
      const p = parseFuelReceipt(receipt(`32,45 L x 7,19\nTOTAL 233,32@${MIN_CONFIDENCE - 1}`), TODAY)
      expect(p.totalRon).toEqual({ value: null, state: 'unsure' })
      expect(p.litres.state).toBe('read')
    })

    it('only the words the value came from count', () => {
      const p = parseFuelReceipt(receipt('TOTAL@30 233,32'), TODAY)
      // The label was barely legible, the figure was clear.
      expect(p.totalRon).toEqual({ value: 233.32, state: 'read' })
    })

    it('a smudged date is unsure', () => {
      expect(parseFuelReceipt(receipt('DATA 12.09.2026@50'), TODAY).date.state).toBe('unsure')
    })
  })

  describe('the arithmetic has to agree', () => {
    it('litres × price that does not come to the total makes all three unsure', () => {
      // 32,45 × 7,19 = 233,32 — a 2 read as a 7 in the total.
      const p = parseFuelReceipt(receipt('32,45 L x 7,19\nTOTAL 733,32'), TODAY)
      expect(p.litres).toEqual({ value: null, state: 'unsure' })
      expect(p.pricePerLitre).toEqual({ value: null, state: 'unsure' })
      expect(p.totalRon).toEqual({ value: null, state: 'unsure' })
    })

    it('rounding at the pump is within tolerance', () => {
      const p = parseFuelReceipt(receipt('41,234 L x 7,189\nTOTAL 296,43'), TODAY)
      expect(p.totalRon.state).toBe('read')
    })

    it('nothing is derived: no total read means no total proposed', () => {
      const p = parseFuelReceipt(receipt('32,45 L x 7,19'), TODAY)
      expect(p.totalRon).toEqual({ value: null, state: 'missing' })
    })
  })

  it('an out-of-range value is unsure rather than proposed', () => {
    const p = parseFuelReceipt(receipt('TOTAL 0,20'), TODAY)
    expect(p.totalRon.state).toBe('unsure')
  })

  it('a blank or unreadable photo proposes nothing', () => {
    const p = parseFuelReceipt(receipt('~~ ,,, ..'), TODAY)
    expect(readAnything(p)).toBe(false)
    expect(parseFuelReceipt([], TODAY).totalRon.state).toBe('missing')
  })

  it('reads diacritics and lower case the same', () => {
    const p = parseFuelReceipt(receipt('Cantitate: 20,00\nPreț unitar: 7,00\nTotal 140,00'), TODAY)
    expect(p.litres.value).toBe(20)
    expect(p.pricePerLitre.value).toBe(7)
    expect(p.totalRon.value).toBe(140)
  })
})
