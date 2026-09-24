import fs from 'fs'
import path from 'path'

/**
 * Tailwind silently drops any variant used inside `@apply` when the rule
 * is not in a `@layer`. No warning, no build error — the declaration just
 * isn't in the output.
 *
 * That is exactly what happened to the dark halves of every badge and
 * note: they compiled to nothing, so a green "Done" badge kept
 * `bg-green-100 text-green-800` on a near-black card. The theme looked
 * finished and wasn't, and nothing in the toolchain said so.
 *
 * These tests read globals.css rather than the build output, because
 * `npm test` doesn't run a build — but they pin the structural property
 * that made the output wrong.
 */

const CSS = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')

/** The body of `@layer components { ... }`, or null if there isn't one. */
function componentsLayer(): string | null {
  const start = CSS.indexOf('@layer components {')
  if (start === -1) return null
  // The layer runs to the end of the file; every component class lives in it.
  return CSS.slice(start)
}

describe('globals.css', () => {
  it('has an @layer components block', () => {
    expect(componentsLayer()).not.toBeNull()
  })

  /**
   * The rule this file exists to enforce. An `@apply` carrying a variant
   * outside a layer is a declaration that will not appear in the build.
   */
  it('puts every @apply with a variant inside a layer', () => {
    const layer = componentsLayer() ?? ''
    const layerStart = CSS.indexOf('@layer components {')

    const outside = CSS.slice(0, layerStart === -1 ? CSS.length : layerStart)
    const offenders = outside
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@apply') && /(^|\s)(dark|hover|focus|focus-visible|sm|md|lg):/.test(line))

    expect(offenders).toEqual([])
    // And the layer is where they actually are.
    expect(layer).toMatch(/@apply[^;]*dark:/)
  })

  /**
   * A layer nested in a media query is still valid CSS, so nothing fails
   * — every component class just stops applying whenever the query does
   * not match. That is how "reduce motion" once meant "no buttons".
   */
  it('keeps the layer at the top level, not inside another block', () => {
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = withoutComments.indexOf('@layer components {')
    let depth = 0
    for (const ch of withoutComments.slice(0, at)) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    expect(depth).toBe(0)
  })

  it('defines the theme variables outside the layer, where they belong', () => {
    const layerStart = CSS.indexOf('@layer components {')
    const before = CSS.slice(0, layerStart)
    expect(before).toMatch(/:root\s*\{/)
    expect(before).toMatch(/\.dark\s*\{/)
  })
})

describe('the two theme palettes', () => {
  function variablesIn(selector: string): string[] {
    const match = CSS.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
    if (!match) return []
    return Array.from(match[1].matchAll(/--([\w-]+)\s*:/g), (m) => m[1])
  }

  /**
   * A variable defined in one block and not the other keeps its light
   * value on a dark page — the same class of near-invisible bug, one level
   * up.
   */
  it('define exactly the same variables', () => {
    const light = variablesIn(':root').sort()
    const dark = variablesIn('\\.dark').sort()
    expect(light.length).toBeGreaterThan(0)
    expect(dark).toEqual(light)
  })

  it('give every variable an RGB triplet, so Tailwind can add alpha', () => {
    for (const selector of [':root', '\\.dark']) {
      const match = CSS.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
      const values = Array.from(
        (match?.[1] ?? '').matchAll(/--[\w-]+\s*:\s*([^;]+);/g),
        (m) => m[1].trim()
      )
      expect(values.length).toBeGreaterThan(0)
      for (const value of values) {
        expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
      }
    }
  })

  // Pure black hides the elevation between page, card and input entirely.
  it('uses a near-black rather than #000 for the dark background', () => {
    const match = CSS.match(/\.dark\s*\{[^}]*--background:\s*([^;]+);/)
    expect(match).not.toBeNull()
    const [r, g, b] = match![1].trim().split(/\s+/).map(Number)
    expect(r + g + b).toBeGreaterThan(0)
    expect(r + g + b).toBeLessThan(120)
  })
})

/**
 * Touch ergonomics. Both rules are invisible on a desktop, which is where
 * the screens get built, so they are pinned here rather than left to be
 * "tidied" back to text-sm.
 */
describe('touch ergonomics', () => {
  // Looked up inside the layer: `.btn {` also opens the reduced-motion
  // transition rule near the top of the file.
  function rule(selector: string): string {
    const layer = componentsLayer() ?? ''
    const start = layer.indexOf(`  ${selector} {`)
    expect(start).toBeGreaterThan(-1)
    return layer.slice(start, layer.indexOf('}', start))
  }

  it('keeps form fields at 16px below sm, or iOS Safari zooms the page on focus', () => {
    const input = rule('.input')
    // text-base unprefixed (phones), and the smaller size only from sm up.
    expect(input).toMatch(/\stext-base\s/)
    expect(input).not.toMatch(/(^|\s)text-(xs|sm)\s/)
    expect(input).toMatch(/\ssm:text-sm/)
  })

  it('gives buttons, fields and chips a 44px/36px minimum height on phones', () => {
    expect(rule('.btn')).toMatch(/\smin-h-11\s/)
    expect(rule('.input')).toMatch(/\smin-h-11\s/)
    expect(rule('.chip')).toMatch(/\smin-h-9\s/)
  })
})
