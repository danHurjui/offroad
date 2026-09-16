'use client'

import { OPEN_SHORTCUTS_EVENT } from '@/lib/shortcuts'

/**
 * Opens the shortcut sheet. Hidden below `sm` — a phone has no keyboard to
 * shortcut with, and the header has no room to spare there.
 */
export default function ShortcutHelpButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}
      title="Keyboard shortcuts (?)"
      aria-label="Show keyboard shortcuts"
      className="hidden h-8 w-8 items-center justify-center rounded-lg text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:flex"
    >
      <span aria-hidden>?</span>
    </button>
  )
}
