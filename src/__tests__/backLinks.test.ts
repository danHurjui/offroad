import fs from 'fs'
import path from 'path'

/**
 * Every screen under the dashboard offers a way back.
 *
 * The vehicle page did not: its own sub-pages all linked back to it, but
 * from the vehicle itself the only route to the garage was the logo in the
 * header, which does not read as a link. Several forms (new/edit vehicle,
 * new/edit task, new/edit wishlist item, settings) were the same.
 */
describe('dashboard navigation', () => {
  const ROOT = path.join(process.cwd(), 'src', 'app', 'dashboard')

  const pages = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return pages(full)
      return entry.name === 'page.tsx' ? [full] : []
    })

  // The garage itself is the top of this tree; the header covers the rest.
  // It sits in the `(garage)` route group so its loading skeleton covers
  // only that page — same URL, /dashboard.
  const isRoot = (file: string) => file === path.join(ROOT, '(garage)', 'page.tsx')

  it.each(pages(ROOT).filter((f) => !isRoot(f)).map((f) => [path.relative(ROOT, f), f]))(
    '%s links back',
    (_label, file) => {
      const source = fs.readFileSync(file, 'utf8')
      // A page that only redirects (the header's "Business") renders no
      // screen to go back from.
      if (/\bredirect\(/.test(source) && !/<[A-Za-z]/.test(source)) return
      // Either the shared `common.backTo` or one of the screen-specific
      // back keys that predate it.
      expect(source).toMatch(/backTo/)
    }
  )

  it('covers every page, so a new screen cannot slip through unchecked', () => {
    expect(pages(ROOT).length).toBeGreaterThan(20)
  })
})
