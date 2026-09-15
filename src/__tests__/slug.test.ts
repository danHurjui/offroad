import { slugify, uniqueSlug } from '@/lib/slug'

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric runs with a hyphen', () => {
    expect(slugify('2001 Jeep Wrangler TJ')).toBe('2001-jeep-wrangler-tj')
  })

  it('strips diacritics', () => {
    expect(slugify('Dan Hurjuiță')).toBe('dan-hurjuita')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Hello World!--  ')).toBe('hello-world')
  })

  it('caps length at 60 characters', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBeLessThanOrEqual(60)
  })
})

describe('uniqueSlug', () => {
  it('returns the base when it does not exist', async () => {
    const slug = await uniqueSlug('jeep-tj', async () => false)
    expect(slug).toBe('jeep-tj')
  })

  it('appends -2 on the first collision', async () => {
    const exists = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const slug = await uniqueSlug('jeep-tj', exists)
    expect(slug).toBe('jeep-tj-2')
  })

  it('keeps incrementing through multiple collisions', async () => {
    const exists = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const slug = await uniqueSlug('jeep-tj', exists)
    expect(slug).toBe('jeep-tj-4')
  })

  it('falls back to "x" for an empty base', async () => {
    const slug = await uniqueSlug('', async () => false)
    expect(slug).toBe('x')
  })
})
