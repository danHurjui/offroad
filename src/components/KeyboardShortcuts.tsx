'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ShortcutHelpDialog from './ShortcutHelpDialog'
import {
  CHORD_PREFIXES,
  CHORD_TIMEOUT_MS,
  OPEN_SHORTCUTS_EVENT,
  UNDO_EVENT,
  hasSystemModifier,
  isTypingTarget,
  matchShortcut,
  newHrefForPath,
} from '@/lib/shortcuts'

/**
 * Mounted once in the root layout, so the shortcuts work on every signed-in
 * page rather than only the ones that happen to share a layout. Renders
 * nothing except the help dialog; everything else is a keydown listener.
 *
 * It reads the session from the client (SessionProvider is already in the
 * tree) rather than being handed one from the server: calling
 * getServerSession in the root layout would make /login, /register and
 * /reset-password dynamic, and they are static today.
 *
 * `n` is deliberately context-sensitive — on a vehicle it adds a task, and
 * anywhere else it starts a new vehicle. A single "new" key that means the
 * most likely thing beats two keys nobody remembers.
 */
export default function KeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname()
  const { status } = useSession()
  const [helpOpen, setHelpOpen] = useState(false)

  // Pending chord prefix (the 'g' of 'g d'), and the timer that forgets it.
  const pending = useRef<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = useCallback(() => {
    pending.current = null
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current)
      pendingTimer.current = null
    }
  }, [])


  /**
   * `/` focuses this page's search box if it has one. Matching on the input
   * type rather than a hand-maintained list of ids means a new search field
   * is picked up without touching this file.
   */
  const focusSearch = useCallback(() => {
    const field = document.querySelector<HTMLInputElement>(
      'input[type="search"], input[name="q"], input[name="search"]'
    )
    if (!field) return false
    field.focus()
    field.select()
    return true
  }, [])

  useEffect(() => {
    // Every shortcut leads somewhere behind the login wall, so binding them
    // for a logged-out visitor would only ever bounce them to /login.
    if (status !== 'authenticated') return

    function onKeyDown(event: KeyboardEvent) {
      // The dialog owns Escape while it is open.
      if (helpOpen && event.key === 'Escape') return
      if (hasSystemModifier(event)) return
      if (isTypingTarget(event.target)) return

      const key = event.key

      if (pending.current) {
        const shortcut = matchShortcut([pending.current, key])
        clearPending()
        if (shortcut?.href) {
          event.preventDefault()
          router.push(shortcut.href)
        }
        // An unrecognised second key just cancels the chord; it must not
        // then be treated as a single-key shortcut of its own, or `g` then
        // `n` would create something.
        return
      }

      if (CHORD_PREFIXES.includes(key)) {
        pending.current = key
        pendingTimer.current = setTimeout(clearPending, CHORD_TIMEOUT_MS)
        return
      }

      const shortcut = matchShortcut([key])
      if (!shortcut) return

      if (key === '?') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (key === '/') {
        if (focusSearch()) event.preventDefault()
        return
      }
      if (key === 'u') {
        event.preventDefault()
        window.dispatchEvent(new Event(UNDO_EVENT))
        return
      }
      if (key === 'n') {
        event.preventDefault()
        router.push(newHrefForPath(pathname))
        return
      }
      if (shortcut.href) {
        event.preventDefault()
        router.push(shortcut.href)
      }
    }

    // The header's "?" button opens the same sheet — there is no keyboard
    // on a phone, and a shortcut nobody can discover may as well not exist.
    const openFromButton = () => setHelpOpen(true)

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openFromButton)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, openFromButton)
      clearPending()
    }
  }, [router, pathname, status, helpOpen, clearPending, focusSearch])

  if (status !== 'authenticated') return null

  return <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
}
