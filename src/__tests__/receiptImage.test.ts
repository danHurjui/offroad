import { flattenLighting, prepareReceiptPixels, stretchContrast } from '@/lib/receiptImage'

/**
 * RL-048: the photo clean-up. A synthetic receipt — paper with rows of
 * "text" — lit by a shadow over its left half: the case one global
 * contrast stretch cannot fix, because the shadowed paper is darker than
 * the lit side's ink.
 */

const W = 400
const H = 200

/** Paper at `paper(x)`, ink at 30% of the paper's brightness in text rows. */
function receipt(paper: (x: number) => number): Uint8Array {
  const img = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inText = y % 20 < 6 && x % 8 < 4
      img[y * W + x] = Math.round(inText ? paper(x) * 0.3 : paper(x))
    }
  }
  return img
}

const shadowed = (x: number) => (x < W / 2 ? 70 : 235)
const at = (img: Uint8Array, x: number, y: number) => img[y * W + x]
const INK = { y: 2, x: 1 }
const PAPER = { y: 12, x: 1 }

describe('flattenLighting', () => {
  it('the shadowed paper comes out as light as the lit paper', () => {
    const out = flattenLighting(receipt(shadowed), W, H, 20)
    const shadePaper = at(out, 40 + PAPER.x, PAPER.y)
    const litPaper = at(out, 296 + PAPER.x, PAPER.y)
    expect(shadePaper).toBeGreaterThan(230)
    expect(litPaper).toBeGreaterThan(230)
  })

  it('ink stays ink on both sides, darker than any paper', () => {
    const out = flattenLighting(receipt(shadowed), W, H, 20)
    expect(at(out, 40 + INK.x, INK.y)).toBeLessThan(110)
    expect(at(out, 296 + INK.x, INK.y)).toBeLessThan(110)
  })

  it('before it, the shadowed paper was darker than the lit ink — the case it exists for', () => {
    const raw = receipt(shadowed)
    expect(at(raw, 40 + PAPER.x, PAPER.y)).toBeLessThan(at(raw, 296 + INK.x, INK.y))
  })

  it('leaves no dark band where the receipt meets a brighter surround', () => {
    // A shadowed receipt (paper 70) on a lit counter (150): smoothing the
    // estimate across cells used to carry the counter's brightness over the
    // paper's edge and leave a grey band the engine dropped the first
    // letters of each line with. Two cells in, the paper must be paper.
    const img = receipt((x) => (x < 100 ? 150 : 70))
    for (let y = 0; y < H; y++) for (let x = 0; x < 100; x++) img[y * W + x] = 150
    const out = flattenLighting(img, W, H, 20)
    expect(at(out, 144 + PAPER.x, PAPER.y)).toBeGreaterThan(230)
    expect(at(out, 144 + INK.x, INK.y)).toBeLessThan(110)
    expect(at(out, 40, 10)).toBeGreaterThan(230)
  })
})

describe('stretchContrast', () => {
  it('faded print spans the range', () => {
    const faded = new Uint8Array(1000).map((_, i) => (i % 10 === 0 ? 150 : 225))
    const out = stretchContrast(faded)
    expect(Math.min(...out)).toBe(0)
    expect(Math.max(...out)).toBe(255)
  })

  it('a flat image does not divide by zero', () => {
    expect(Array.from(stretchContrast(new Uint8Array(10).fill(128)))).toEqual(new Array(10).fill(0))
  })
})

it('the whole clean-up separates ink from paper under the shadow', () => {
  const out = prepareReceiptPixels(receipt(shadowed), W, H)
  expect(at(out, 40 + PAPER.x, PAPER.y) - at(out, 40 + INK.x, INK.y)).toBeGreaterThan(150)
})
