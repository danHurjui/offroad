import { publicCardUrl } from '@/lib/card'

describe('publicCardUrl', () => {
  it('returns the full public path when the vehicle is public and both username/slug exist', () => {
    expect(publicCardUrl(true, 'dan', '2001-jeep-tj')).toBe('riglog.ro/builds/dan/2001-jeep-tj')
  })

  it('falls back to the bare domain when the vehicle is private', () => {
    expect(publicCardUrl(false, 'dan', '2001-jeep-tj')).toBe('riglog.ro')
  })

  it('falls back to the bare domain when username or slug is missing', () => {
    expect(publicCardUrl(true, null, '2001-jeep-tj')).toBe('riglog.ro')
    expect(publicCardUrl(true, 'dan', null)).toBe('riglog.ro')
  })
})
