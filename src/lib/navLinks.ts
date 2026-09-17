/**
 * Which top-level section a path belongs to.
 *
 * A plain function rather than a `pathname.startsWith(href)` written into
 * the header, because the obvious version gets the garage wrong: every
 * signed-in screen lives under `/dashboard`, so a prefix match would light
 * that link up permanently and the highlight would say nothing. The
 * sections are spelled out instead.
 */
export function isActiveNavLink(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    // The garage and the vehicles inside it. Settings is under the same
    // prefix but is its own entry, and is reached from the account side.
    return pathname === '/dashboard' || pathname.startsWith('/dashboard/vehicles')
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
