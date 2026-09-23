import {
  MIN_CONFIDENCE,
  arithmeticTolerance,
  isComplete,
  mergeProposals,
  mergeSplitRows,
  parseFuelReceipt,
  parseReceiptNumber,
  readAnything,
  type OcrLine,
  type ReceiptProposal,
} from '@/lib/receiptParse'

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

/** A line placed on the page: words at x positions, foot at `foot` (+ slope per px). */
function placed(foot: number, words: [string, number][], slope = 0, confidence = 95): OcrLine {
  const height = 30
  const boxed = words.map(([text, x]) => {
    const y1 = foot + slope * x
    return { text, confidence, bbox: { x0: x, y0: y1 - height, x1: x + text.length * 18, y1 } }
  })
  const last = boxed[boxed.length - 1].bbox
  return { words: boxed, baseline: { x0: boxed[0].bbox.x0, y0: boxed[0].bbox.y1, x1: last.x1, y1: foot + slope * last.x1 } }
}

describe('mergeSplitRows', () => {
  it('puts a right-aligned amount back on its TOTAL row', () => {
    const lines = [placed(100, [['TOTAL', 20], ['LEI', 140]]), placed(160, [['CARD', 20]]), placed(101, [['233,32', 700]])]
    const rows = mergeSplitRows(lines).map((l) => l.words.map((w) => w.text).join(' '))
    expect(rows).toEqual(['TOTAL LEI 233,32', 'CARD'])
  })

  it('follows the tilt of the photo rather than the height alone', () => {
    // A 4° tilt: the amount's foot sits ~48px lower than the label's, more
    // than a line height — yet it is the same printed row.
    const slope = Math.tan((4 * Math.PI) / 180)
    const lines = [placed(100, [['TOTAL', 20], ['LEI', 140]], slope), placed(140, [['TVA', 20]], slope), placed(100, [['233,32', 700]], slope)]
    const rows = mergeSplitRows(lines).map((l) => l.words.map((w) => w.text).join(' '))
    expect(rows).toContain('TOTAL LEI 233,32')
    expect(rows).toContain('TVA')
  })

  it('never joins stacked rows, or fragments that overlap sideways', () => {
    const lines = [placed(100, [['TOTAL', 20]]), placed(135, [['233,32', 700]]), placed(170, [['A', 30]]), placed(171, [['B', 40]])]
    expect(mergeSplitRows(lines)).toHaveLength(4)
  })

  it('lines without word boxes pass through untouched', () => {
    const lines = receipt('TOTAL\n233,32')
    expect(mergeSplitRows(lines)).toEqual(lines)
  })

  it('reads the total a split row would otherwise have lost', () => {
    const lines = [placed(100, [['32,45', 20], ['L', 150], ['x', 190], ['7,19', 230]]), placed(160, [['TOTAL', 20]]), placed(161, [['233,32', 700]])]
    expect(parseFuelReceipt(lines, TODAY).totalRon).toEqual({ value: 233.32, state: 'read' })
  })
})

describe('the fuel line’s own amount', () => {
  it('checks litres × price, and is the fuel total when the receipt also has a coffee', () => {
    const p = parseFuelReceipt(receipt('60,55 L x 7,29 = 441,41 B\nCAFEA 12,00 B\nTOTAL 453,41'), TODAY)
    expect(p.litres.value).toBe(60.55)
    expect(p.totalRon).toEqual({ value: 441.41, state: 'read' })
  })

  it('may be alone on the row below', () => {
    const p = parseFuelReceipt(receipt('32,45 L x 7,19 LEI/L\n233,32 B\nTOTAL LEI 233,32'), TODAY)
    expect(p.totalRon).toEqual({ value: 233.32, state: 'read' })
  })

  it('a misread litre figure it disagrees with is unsure — even with no TOTAL read', () => {
    // 60,55 read as 50,55: the dangerous kind, a confident wrong digit.
    const p = parseFuelReceipt(receipt('50,55 L x 7,29 441,41 B'), TODAY)
    expect(p.litres).toEqual({ value: null, state: 'unsure' })
    expect(p.pricePerLitre).toEqual({ value: null, state: 'unsure' })
  })
})

describe('arithmeticTolerance comes from the printed precision', () => {
  const r = (value: number, decimals: number) => ({ value, confidence: 95, decimals })

  it('three decimals leave little room', () => {
    // 25,000 L misread as 25,006 is 0.04 lei out — too far for 3 decimals.
    expect(arithmeticTolerance(r(25.006, 3), r(7.09, 3))).toBeLessThan(0.03)
    const p = parseFuelReceipt(receipt('25,006 LTR x 7,090\n177,25 A\nTOTAL 177,25'), TODAY)
    expect(p.litres.state).toBe('unsure')
  })

  it('two decimals leave what the pump’s rounding needs', () => {
    expect(arithmeticTolerance(r(32.45, 2), r(7.19, 2))).toBeGreaterThan(Math.abs(32.45 * 7.19 - 233.32))
  })
})

describe('mergeProposals — two readings of one receipt', () => {
  const read = <T,>(value: T) => ({ value, state: 'read' as const })
  const none = { value: null, state: 'missing' as const }
  const doubt = { value: null, state: 'unsure' as const }
  const base: ReceiptProposal = { date: none, station: none, litres: none, pricePerLitre: none, totalRon: none }

  it('takes the money fields together from the reading that verified more', () => {
    const a = { ...base, litres: read(32.45), totalRon: doubt, pricePerLitre: doubt }
    const b = { ...base, litres: read(32.45), pricePerLitre: read(7.19), totalRon: read(233.32) }
    const m = mergeProposals(a, b)
    expect([m.litres.value, m.pricePerLitre.value, m.totalRon.value]).toEqual([32.45, 7.19, 233.32])
  })

  it('never pairs litres from one with a total from the other', () => {
    const a = { ...base, litres: read(32.45), pricePerLitre: read(7.19), totalRon: doubt }
    const b = { ...base, litres: doubt, pricePerLitre: doubt, totalRon: read(233.32) }
    const m = mergeProposals(a, b)
    expect(m.litres.value).toBe(32.45)
    expect(m.totalRon.state).toBe('unsure')
  })

  it('two readings that disagree make the field unsure', () => {
    const a = { ...base, date: read('2026-09-12'), litres: read(25), pricePerLitre: read(7.09), totalRon: read(177.25) }
    const b = { ...base, date: read('2026-09-13'), litres: read(25.006), pricePerLitre: read(7.09), totalRon: read(177.25) }
    const m = mergeProposals(a, b)
    expect(m.date.state).toBe('unsure')
    expect(m.litres.state).toBe('unsure')
    expect(m.totalRon).toEqual(read(177.25))
  })

  it('a field only one reading found is kept', () => {
    const m = mergeProposals({ ...base, station: read('OMV') }, { ...base, date: read('2026-09-12') })
    expect(m.station).toEqual(read('OMV'))
    expect(m.date).toEqual(read('2026-09-12'))
  })

  it('isComplete needs date, litres and total all read', () => {
    expect(isComplete({ ...base, date: read('2026-09-12'), litres: read(1), totalRon: read(7) })).toBe(true)
    expect(isComplete({ ...base, date: read('2026-09-12'), litres: read(1), totalRon: doubt })).toBe(false)
  })
})
