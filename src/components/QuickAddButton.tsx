'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { newHrefForPath } from '@/lib/shortcuts'

/**
 * The header's + button. Same destination as the `n` shortcut, from the
 * same function, so the two can never point at different things.
 *
 * A real <Link>, not a button with an onClick: it prefetches, it opens in a
 * new tab on middle-click, and it works before hydration.
 */
export default function QuickAddButton() {
  const pathname = usePathname()
  const href = newHrefForPath(pathname)
  const onVehicle = href.endsWith('/tasks/new')
  const label = onVehicle ? 'Add a task to this vehicle' : 'Add a vehicle'

  return (
    <Link
      href={href}
      title={`${label} (n)`}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <span aria-hidden>+</span>
    </Link>
  )
}
