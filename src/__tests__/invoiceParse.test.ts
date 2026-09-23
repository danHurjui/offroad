import { MIN_CONFIDENCE } from '@/lib/ocrText'
import { invoiceReadAnything, isInvoiceComplete, mergeInvoiceProposals, parseInvoice, type InvoiceProposal } from '@/lib/invoiceParse'
import type { OcrLine } from '@/lib/ocrText'

/**
 * RL-048 slice 2: a service invoice read into a workshop job. Written the
 * way Tesseract returns them — words with a confidence each.
 */

const TODAY = new Date('2026-09-23T12:00:00Z')

function doc(text: string, confidence = 95): OcrLine[] {
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

/** Net value + VAT per line, the usual Romanian invoice. */
const VAT_COLUMN = `
SERVICE AUTO MOTORSPORT SRL
CIF: RO12345678 Reg. Com.: J40/1234/2015
FACTURA FISCALA Seria MS nr. 1234
Scadenta: 02.09.2026
Data: 12.09.2026
Cumparator: POPESCU ION
Auto: Dacia Logan KM: 145.230
Nr. crt Denumire U.M. Cant. Pret unitar Valoare TVA
1 Ulei motor 5W30 L 4,00 45,00 180,00 34,20
2 Filtru ulei buc 1,00 40,00 40,00 7,60
3 Manopera schimb ulei ore 1,00 100,00 100,00 19,00
Total 320,00 60,80
TOTAL DE PLATA 380,80
`

describe('parseInvoice', () => {
  it('reads a VAT-column invoice: the lines add up, split into parts and labour, VAT included', () => {
    const p = parseInvoice(doc(VAT_COLUMN), TODAY)
    expect(p.totalRon).toEqual({ value: 380.8, state: 'read' })
    expect(p.partsRon).toEqual({ value: 261.8, state: 'read' })
    expect(p.labourRon).toEqual({ value: 119, state: 'read' })
    expect(p.items).toEqual([
      { description: 'Ulei motor 5W30', amountRon: 214.2, kind: 'part' },
      { description: 'Filtru ulei', amountRon: 47.6, kind: 'part' },
      { description: 'Manopera schimb ulei', amountRon: 119, kind: 'labour' },
    ])
    expect(isInvoiceComplete(p)).toBe(true)
  })

  it('reads the workshop, the number, the km — and the issue date, not the due date', () => {
    const p = parseInvoice(doc(VAT_COLUMN), TODAY)
    expect(p.workshop).toEqual({ value: 'SERVICE AUTO MOTORSPORT SRL', state: 'read' })
    expect(p.invoiceNumber).toEqual({ value: 'MS 1234', state: 'read' })
    expect(p.km).toEqual({ value: 145230, state: 'read' })
    expect(p.date).toEqual({ value: '2026-09-12', state: 'read' })
  })

  it('reads gross-per-line receipts, with an hours unit or labour wording as labour', () => {
    const p = parseInvoice(
      doc(`
VULCANIZARE RAPID SRL
Echilibrare roti 4 BUC x 25,00 100,00 A
Supape 4 BUC x 5,00 20,00 A
Diagnoza 0,5 ORE x 80,00 40,00 A
TOTAL 160,00
DATA 10.09.2026
      `),
      TODAY
    )
    expect(p.labourRon.value).toBe(140)
    expect(p.partsRon.value).toBe(20)
  })

  it('uses the footer’s own split when there is no table that adds up', () => {
    const p = parseInvoice(doc('AUTO SERVICE SRL\nRevizie completa conform fisa\nTOTAL PIESE 400,00\nTOTAL MANOPERA 200,00\nTOTAL DE PLATA 600,00'), TODAY)
    expect(p.partsRon.value).toBe(400)
    expect(p.labourRon.value).toBe(200)
    expect(p.items).toEqual([])
  })

  it('never spreads a footer-only VAT over the lines: no split, both unsure', () => {
    const p = parseInvoice(
      doc(`
Nr. crt Denumire Cant Pret Valoare
1 Placute frana 1,00 200,00 200,00
2 Manopera 1,00 100,00 100,00
Total 300,00 57,00
TOTAL DE PLATA 357,00
      `),
      TODAY
    )
    expect(p.partsRon).toEqual({ value: null, state: 'unsure' })
    expect(p.labourRon).toEqual({ value: null, state: 'unsure' })
    expect(p.items).toEqual([])
    // What was paid is still read, and shown.
    expect(p.totalRon.value).toBe(357)
  })

  it('one smudged line amount makes the whole split unsure', () => {
    const text = VAT_COLUMN.replace('180,00 34,20', `180,00 34,20@${MIN_CONFIDENCE - 5}`)
    const p = parseInvoice(doc(text), TODAY)
    expect(p.partsRon.state).toBe('unsure')
    expect(p.labourRon.state).toBe('unsure')
    expect(p.items).toEqual([])
  })

  it('a misread line that breaks the sum proposes no money', () => {
    const p = parseInvoice(doc(VAT_COLUMN.replace('40,00 7,60', '40,00 1,60')), TODAY)
    expect(p.partsRon.state).toBe('unsure')
  })

  it('a description that ran onto a second line is joined back', () => {
    const p = parseInvoice(doc('Denumire Valoare\n1 Kit distributie cu\npompa apa 1.6 dCi buc 1,00 900,00 900,00\nTOTAL 900,00'), TODAY)
    expect(p.items).toHaveLength(1)
    expect(p.partsRon.value).toBe(900)
  })

  describe('the workshop', () => {
    it('after a Furnizor label, as printed (diacritics kept)', () => {
      const p = parseInvoice(doc('Furnizor: Service Auto Brașov SRL\nCumparator: FIRMA MEA SRL'), TODAY)
      expect(p.workshop.value).toBe('Service Auto Brașov SRL')
    })

    it('never the customer — on a company car that is the reader’s own company', () => {
      const p = parseInvoice(doc('Client:\nFIRMA MEA TRANSPORT SRL\nSERVICE BUN SRL'), TODAY)
      expect(p.workshop.value).toBe('SERVICE BUN SRL')
    })

    it('stops at a customer label on the same line', () => {
      const p = parseInvoice(doc('Furnizor: SERVICE BUN SRL Client: ION POP'), TODAY)
      expect(p.workshop.value).toBe('SERVICE BUN SRL')
    })
  })

  it.each([
    ['KM: 145.230', 145230],
    ['Kilometraj 98765', 98765],
    ['Km bord: 12 345', 12345],
  ])('km from %p', (line, km) => {
    expect(parseInvoice(doc(line), TODAY).km.value).toBe(km)
  })

  it('an invoice number with no series', () => {
    expect(parseInvoice(doc('Factura nr. 00456 din 01.09.2026'), TODAY).invoiceNumber.value).toBe('00456')
  })

  it('nothing readable proposes nothing', () => {
    const p = parseInvoice(doc('~~ ,,,'), TODAY)
    expect(invoiceReadAnything(p)).toBe(false)
    expect(p.partsRon.state).toBe('missing')
  })
})

describe('mergeInvoiceProposals', () => {
  const a = parseInvoice(doc(VAT_COLUMN), TODAY)
  const blank: InvoiceProposal = parseInvoice([], TODAY)

  it('takes the money whole from the reading whose lines added up', () => {
    const m = mergeInvoiceProposals({ ...blank, partsRon: { value: null, state: 'unsure' } }, a)
    expect(m.partsRon.value).toBe(261.8)
    expect(m.items).toHaveLength(3)
  })

  it('two readings that split differently: unsure, and no items', () => {
    const b = { ...a, partsRon: { value: 250, state: 'read' as const } }
    const m = mergeInvoiceProposals(a, b)
    expect(m.partsRon.state).toBe('unsure')
    expect(m.items).toEqual([])
  })
})

/** Words placed on the page: [text, x] at a line's foot `foot`. */
function placed(foot: number, words: [string, number][], confidence = 95): OcrLine {
  return {
    words: words.map(([text, x]) => ({ text, confidence, bbox: { x0: x, y0: foot - 28, x1: x + text.length * 16, y1: foot } })),
    baseline: { x0: words[0][1], y0: foot, x1: words[words.length - 1][1] + 40, y1: foot },
  }
}

describe('layouts found on the bench (real engine, rendered invoices)', () => {
  it('the issue date when the due date shares its line', () => {
    const p = parseInvoice(doc('Data: 12.09.2026 Scadenta: 02.09.2026'), TODAY)
    expect(p.date.value).toBe('2026-09-12')
  })

  it('a table cell that wrapped: its figures, split over two fragments, are one row again', () => {
    // Middle-aligned cells: the price sits with the first line, the rest
    // with the second. Columns: qty 700, price 900, value 1060, VAT 1200.
    const lines = [
      placed(100, [['Nr', 20], ['Denumire', 80], ['Cant.', 700], ['Pret', 900], ['Valoare', 1060], ['TVA', 1200]]),
      placed(160, [['1', 20], ['Filtru', 80], ['ulei', 190], ['1,00', 700], ['40,00', 900], ['40,00', 1060], ['7,60', 1200]]),
      placed(220, [['2', 20], ['Manopera', 80], ['schimb', 240], ['100,00', 900]]),
      placed(255, [['ulei', 80], ['1,00', 700], ['100,00', 1060], ['19,00', 1200]]),
      placed(320, [['TOTAL', 20], ['DE', 140], ['PLATA', 200], ['166,60', 1060]]),
    ]
    const p = parseInvoice(lines, TODAY)
    expect(p.items.map((it) => [it.description, it.amountRon, it.kind])).toEqual([
      ['Filtru ulei', 47.6, 'part'],
      ['Manopera schimb ulei', 119, 'labour'],
    ])
  })

  it('a receipt line whose amount wrapped to the start of the next line keeps reading order', () => {
    const lines = [
      placed(100, [['Echilibrare', 20], ['roti', 220], ['4', 300], ['BUC', 330], ['x', 400], ['25,00', 430]]),
      placed(140, [['100,00', 20], ['A', 140]]),
      placed(180, [['Supape', 20], ['4', 300], ['BUC', 330], ['x', 400], ['5,00', 430], ['20,00', 560]]),
      placed(230, [['TOTAL', 20], ['120,00', 560]]),
    ]
    const p = parseInvoice(lines, TODAY)
    expect(p.labourRon.value).toBe(100)
    expect(p.partsRon.value).toBe(20)
  })

  it('a header that wrapped ("produs / serviciu") does not make the first part labour', () => {
    const p = parseInvoice(doc('Denumire produs /\nserviciu\n1 Discuri frana buc 2,00 250,00 500,00 95,00\n2 Manopera ore 1,00 100,00 100,00 19,00\nTOTAL DE PLATA 714,00'), TODAY)
    expect(p.items.map((it) => it.kind)).toEqual(['part', 'labour'])
  })

  it('a km figure that runs into more of a number is not taken', () => {
    expect(parseInvoice(doc('KM: 201.5O0'), TODAY).km.state).not.toBe('read')
  })

  it('a supplier label misread with a semicolon', () => {
    expect(parseInvoice(doc('Furnizor; AUTO FRANA EXPERT SRL'), TODAY).workshop.value).toBe('AUTO FRANA EXPERT SRL')
  })
})
