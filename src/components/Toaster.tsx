'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslations } from 'next-intl'
import { UNDO_WINDOW_MS, UndoQueue, type UndoableAction } from '@/lib/writeFeedback'
import { UNDO_EVENT } from '@/lib/shortcuts'

/**
 * RL-034: the one place a write says how it went.
 *
 * Mounted in the root layout, above every page, so a toast — and more to
 * the point a pending deletion — survives the client-side navigation that
 * often follows the action (delete a task, land back on the vehicle).
 *
 * **It never takes focus.** The region is a polite live region; an error
 * is `role="alert"`. Somebody working through a list with the keyboard
 * keeps their place. To make Undo reachable anyway: its timer pauses
 * while the pointer or focus is inside the toast, and `u` (the shortcut
 * sheet lists it) undoes the newest one from anywhere.
 *
 * Inline `FormError` stays where it is for form validation — a message
 * about a field belongs next to the field, where `aria-describedby` can
 * point at it. Toasts are for actions: a button pressed, a status
 * changed, something removed.
 */

type ToastKind = 'success' | 'error' | 'undo'

interface Toast {
  id: number
  kind: ToastKind
  message: string
  undoKey?: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  /** Hide now, delete when the window closes, unless Undo is pressed. */
  undoable: (action: UndoableAction & { message: string }) => void
  queue: UndoQueue
}

const ToastContext = createContext<ToastApi | null>(null)

const DURATION_MS: Record<ToastKind, number> = {
  success: 4000,
  error: 8000,
  undo: UNDO_WINDOW_MS,
}

/** More than this and the oldest go; a stack of ten covers the page. */
const MAX_VISIBLE = 3

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast() outside <ToastProvider>')
  return api
}

/** Whether something is waiting out its undo window — hide it meanwhile. */
export function usePendingRemoval(key: string): boolean {
  const { queue } = useToast()
  return useSyncExternalStore(
    queue.subscribe,
    () => queue.isPending(key),
    () => false
  )
}

/**
 * For Server Components that list something another page may be deleting
 * (the vehicle page's task rows while a task's undo is open).
 */
export function HideWhilePending({ pendingKey, children }: { pendingKey: string; children: React.ReactNode }) {
  return usePendingRemoval(pendingKey) ? null : <>{children}</>
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('toast')
  const [toasts, setToasts] = useState<Toast[]>([])
  // Mirrors the state so eviction and the `u` shortcut read the current
  // list without waiting for a render.
  const listRef = useRef<Toast[]>([])
  const nextId = useRef(1)
  const queueRef = useRef<UndoQueue | null>(null)
  if (!queueRef.current) queueRef.current = new UndoQueue()
  const queue = queueRef.current

  const setList = useCallback((next: Toast[]) => {
    listRef.current = next
    setToasts(next)
  }, [])

  const remove = useCallback(
    (id: number) => setList(listRef.current.filter((toast) => toast.id !== id)),
    [setList]
  )

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const all = [...listRef.current, { ...toast, id: nextId.current++ }]
      const evicted = all.slice(0, Math.max(0, all.length - MAX_VISIBLE))
      setList(all.slice(-MAX_VISIBLE))
      // An undo toast pushed off the stack loses its button, so its
      // deletion goes ahead now rather than staying hidden forever.
      for (const old of evicted) if (old.undoKey) void queue.commit(old.undoKey)
    },
    [queue, setList]
  )

  const api = useMemo<ToastApi>(
    () => ({
      queue,
      success: (message) => void push({ kind: 'success', message }),
      error: (message) => void push({ kind: 'error', message }),
      undoable: ({ message, ...action }) => {
        queue.add(action)
        push({ kind: 'undo', message, undoKey: action.key })
      },
    }),
    [push, queue]
  )

  // `u` from the shortcut layer: undo the newest thing still undoable.
  useEffect(() => {
    function onUndo() {
      const newest = [...listRef.current].reverse().find((toast) => toast.kind === 'undo' && toast.undoKey)
      if (!newest?.undoKey) return
      queue.undo(newest.undoKey)
      remove(newest.id)
    }
    window.addEventListener(UNDO_EVENT, onUndo)
    return () => window.removeEventListener(UNDO_EVENT, onUndo)
  }, [queue, remove])

  // Closing the tab inside an undo window still deletes — see UndoQueue.
  useEffect(() => {
    const flush = () => queue.flush()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [queue])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label={t('regionLabel')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => remove(toast.id)}
            onExpire={() => {
              remove(toast.id)
              if (toast.undoKey) void queue.commit(toast.undoKey)
            }}
            onUndo={() => {
              if (toast.undoKey) queue.undo(toast.undoKey)
              remove(toast.id)
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({
  toast,
  onClose,
  onExpire,
  onUndo,
}: {
  toast: Toast
  onClose: () => void
  onExpire: () => void
  onUndo: () => void
}) {
  const t = useTranslations('toast')
  const [paused, setPaused] = useState(false)
  const remaining = useRef(DURATION_MS[toast.kind])
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const timer = setTimeout(() => onExpireRef.current(), remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - started))
    }
  }, [paused])

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={`toast pointer-events-auto ${toast.kind === 'error' ? 'toast-error' : toast.kind === 'success' ? 'toast-success' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
      {toast.kind === 'undo' && (
        <button type="button" className="toast-action" onClick={onUndo} aria-keyshortcuts="u">
          {t('undo')}
        </button>
      )}
      <button type="button" className="toast-close" onClick={toast.kind === 'undo' ? onExpire : onClose} aria-label={t('dismiss')}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
