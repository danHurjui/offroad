'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('nav')
  const onVehicle = href.endsWith('/tasks/new')
  // Was two hardcoded English sentences, read out as-is to a Romanian
  // screen-reader user and shown in the tooltip.
  const label = onVehicle ? t('addTask') : t('addVehicle')

  return (
    <Link
      href={href}
      title={`${label} (n)`}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-lg leading-none sm:h-8 sm:w-8 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <span aria-hidden>+</span>
    </Link>
  )
}
