import { isActiveNavLink } from '@/lib/navLinks'

describe('isActiveNavLink', () => {
  it('marks the garage on the garage and inside a vehicle', () => {
    expect(isActiveNavLink('/dashboard', '/dashboard')).toBe(true)
    expect(isActiveNavLink('/dashboard/vehicles/abc', '/dashboard')).toBe(true)
    expect(isActiveNavLink('/dashboard/vehicles/abc/tasks/new', '/dashboard')).toBe(true)
  })

  it('does not mark the garage for every screen that happens to sit under it', () => {
    // A plain prefix match would light the garage up here and on upgrade,
    // which would make the highlight permanent and therefore meaningless.
    expect(isActiveNavLink('/dashboard/settings', '/dashboard')).toBe(false)
    expect(isActiveNavLink('/dashboard/upgrade', '/dashboard')).toBe(false)
  })

  it('marks a section from its own pages', () => {
    expect(isActiveNavLink('/community', '/community')).toBe(true)
    expect(isActiveNavLink('/community/parts-wanted', '/community')).toBe(true)
    expect(isActiveNavLink('/tickets/abc', '/tickets')).toBe(true)
    expect(isActiveNavLink('/admin/users', '/admin')).toBe(true)
  })

  it('does not match a sibling whose path merely starts the same way', () => {
    expect(isActiveNavLink('/ticketsomething', '/tickets')).toBe(false)
    expect(isActiveNavLink('/communityx', '/community')).toBe(false)
  })

  it('leaves everything unmarked off the signed-in sections', () => {
    for (const href of ['/dashboard', '/community', '/tickets', '/admin']) {
      expect(isActiveNavLink('/privacy', href)).toBe(false)
    }
  })
})
