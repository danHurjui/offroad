/**
 * RL-018: URL-safe slug generation, shared by User.username
 * (src/lib/username.ts) and Vehicle.slug (generated in the vehicles
 * route). Pure — no I/O — so it's easily unit-tested; callers supply an
 * `exists()` check against whatever uniqueness scope they need (globally
 * unique for username, per-owner for a vehicle slug).
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (ă -> a, ș -> s, ...)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug
}

export async function uniqueSlug(base: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  const safeBase = base || 'x'
  let candidate = safeBase
  let attempt = 2
  while (await exists(candidate)) {
    candidate = `${safeBase}-${attempt}`
    attempt++
  }
  return candidate
}
