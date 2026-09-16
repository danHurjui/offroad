'use client'

import { useEffect, useRef } from 'react'
import { SHORTCUTS, formatKeys, type Shortcut } from '@/lib/shortcuts'

const GROUP_ORDER: Shortcut['group'][] = ['Go to', 'Actions', 'Help']

/**
 * The `?` help sheet.
 *
 * A plain div rather than <dialog>: `showModal()` is fine in modern
 * browsers but this app is a PWA that gets opened in whatever webview the
 * phone provides, and the polyfill-free fallback there is a non-modal
 * dialog that swallows Escape. Doing the three modal behaviours by hand —
 * focus in, Escape out, focus restored — is less code than working around
 * that.
 */
export default function ShortcutHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    // Remember where focus was so closing puts it back — otherwise focus
    // falls to the top of the document and a keyboard user loses their place.
    previouslyFocused.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // The page behind must not scroll while the sheet is up.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        tabIndex={-1}
        // Clicks inside must not reach the backdrop's close handler.
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[80vh] w-full max-w-md overflow-y-auto p-6 focus:outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="shortcut-help-title" className="text-lg font-bold text-ink">
            Keyboard shortcuts
          </h2>
          <button type="button" onClick={onClose} className="btn-secondary px-2 py-1 text-xs" aria-label="Close">
            Esc
          </button>
        </div>

        {GROUP_ORDER.map((group) => {
          const items = SHORTCUTS.filter((s) => s.group === group)
          if (items.length === 0) return null
          return (
            <section key={group} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{group}</h3>
              <ul className="space-y-1.5">
                {items.map((s) => (
                  <li key={s.keys.join('+')} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-ink-muted">{s.label}</span>
                    <span className="shrink-0 whitespace-nowrap">
                      {s.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="mx-1 text-xs text-ink-faint">then</span>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <p className="mt-4 text-xs text-ink-faint">
          Shortcuts are ignored while you&rsquo;re typing in a field. Press{' '}
          <kbd>{formatKeys(['?'])}</kbd> any time to bring this back.
        </p>
      </div>
    </div>
  )
}
