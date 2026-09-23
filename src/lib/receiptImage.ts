/**
 * RL-048: cleaning up a receipt photo before it is read. Pure (it works on
 * a grey pixel array), so it runs the same in the browser and in a test.
 *
 * A photo at a pump is lit unevenly: a hand's or the canopy's shadow over
 * half the receipt, a dark counter around it, faded thermal print. One
 * global contrast stretch fails all three — the counter is darker than the
 * faded ink, and the shadowed half's paper is darker than the lit half's
 * text. So the lighting is flattened first: the paper's brightness is
 * estimated locally (text is dark, so the brightest pixels near any point
 * are paper) and every pixel is divided by it. Paper comes out white
 * everywhere, shadow or not; text keeps its darkness relative to the paper
 * around it. Only then is the contrast stretched.
 *
 * No hard threshold at the end: Tesseract binarises per region itself, and
 * does it better than one cut-off would.
 */

/** Luma of an RGBA buffer, one byte per pixel. */
export function toGrey(rgba: Uint8ClampedArray): Uint8Array {
  const grey = new Uint8Array(rgba.length / 4)
  for (let i = 0, p = 0; p < grey.length; i += 4, p++) {
    grey[p] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2])
  }
  return grey
}

/**
 * Divides out uneven lighting. `cell` is the side of the square the paper
 * brightness is sampled over — a couple of text lines tall, so every cell
 * holds some paper.
 */
export function flattenLighting(grey: Uint8Array, width: number, height: number, cell = Math.max(8, Math.round(Math.max(width, height) / 40))): Uint8Array {
  const gw = Math.ceil(width / cell)
  const gh = Math.ceil(height / cell)

  // Each cell's paper: its 90th-percentile brightness. Text is dark, so
  // that is paper wherever a tenth of the cell is — and, unlike the
  // maximum, a glint on the paper doesn't set it.
  const histograms = new Uint32Array(gw * gh * 256)
  const counts = new Uint32Array(gw * gh)
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * gw
    for (let x = 0; x < width; x++) {
      const c = row + Math.floor(x / cell)
      histograms[c * 256 + grey[y * width + x]]++
      counts[c]++
    }
  }
  const paper = new Float32Array(gw * gh)
  for (let c = 0; c < paper.length; c++) {
    const target = counts[c] * 0.9
    let seen = 0
    let v = 0
    while (v < 255 && seen + histograms[c * 256 + v] < target) seen += histograms[c * 256 + v++]
    paper[c] = v
  }
  // A 3×3 median drops a cell that is all ink (a bold logo) without
  // blurring a shadow's edge into the lit paper beside it — a neighbourhood
  // maximum does exactly that, and leaves the shadowed side dark. A light
  // mean then keeps cell edges from printing onto the result.
  const background = neighbourhood(neighbourhood(paper, gw, gh, 'median'), gw, gh, 'mean')

  const out = new Uint8Array(grey.length)
  for (let y = 0; y < height; y++) {
    const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5))
    const y0 = Math.floor(gy)
    const y1 = Math.min(gh - 1, y0 + 1)
    const fy = gy - y0
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5))
      const x0 = Math.floor(gx)
      const x1 = Math.min(gw - 1, x0 + 1)
      const fx = gx - x0
      const bg =
        background[y0 * gw + x0] * (1 - fx) * (1 - fy) +
        background[y0 * gw + x1] * fx * (1 - fy) +
        background[y1 * gw + x0] * (1 - fx) * fy +
        background[y1 * gw + x1] * fx * fy
      out[y * width + x] = Math.min(255, Math.round((grey[y * width + x] * 255) / Math.max(bg, 1)))
    }
  }
  return out
}

/** A 3×3 median or mean over the grid (edges use the cells they have). */
function neighbourhood(grid: Float32Array, gw: number, gh: number, kind: 'median' | 'mean'): Float32Array {
  const out = new Float32Array(grid.length)
  const values: number[] = []
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      values.length = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) values.push(grid[ny * gw + nx])
        }
      }
      if (kind === 'mean') {
        out[y * gw + x] = values.reduce((a, b) => a + b, 0) / values.length
      } else {
        values.sort((a, b) => a - b)
        out[y * gw + x] = values[Math.floor(values.length / 2)]
      }
    }
  }
  return out
}

/**
 * Stretches the darkest `fraction` to black and the brightest to white, so
 * faded print spans the whole range without a few specks deciding it.
 */
export function stretchContrast(grey: Uint8Array, fraction = 0.01): Uint8Array {
  const histogram = new Array<number>(256).fill(0)
  for (const v of grey) histogram[v]++
  const cut = grey.length * fraction
  let low = 0
  let high = 255
  for (let seen = 0; low < 255 && seen + histogram[low] < cut; low++) seen += histogram[low]
  for (let seen = 0; high > 0 && seen + histogram[high] < cut; high--) seen += histogram[high]
  const range = Math.max(1, high - low)
  const out = new Uint8Array(grey.length)
  for (let i = 0; i < grey.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(((grey[i] - low) * 255) / range)))
  }
  return out
}

/** The whole clean-up, grey in and grey out. */
export function prepareReceiptPixels(grey: Uint8Array, width: number, height: number): Uint8Array {
  return stretchContrast(flattenLighting(grey, width, height))
}
