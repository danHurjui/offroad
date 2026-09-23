/**
 * RL-034: what a write looks like while it is happening, and afterwards.
 *
 * Three pieces, kept free of React so the parts that are easy to get
 * wrong can be tested directly: the optimistic writer, the reason a
 * failed write gives, and the queue behind "Deleted — Undo".
 *
 * ## What is optimistic, and what is not
 *
 * Only small, reversible changes on something the person already
 * controls: a task's status, a wishlist item's status and order, follow,
 * and a ticket vote. **A gated action is never optimistic.** A Pro gate or
 * the confirmed-address gate answers 403, and showing the action succeed
 * then snapping it back is worse than a plain refusal — so a caller that
 * cannot rule the gate out beforehand (a vote from an unconfirmed
 * address) stays pessimistic.
 *
 * ## One impatient tap is at most two requests
 *
 * Each writer keeps at most one request in flight and remembers only the
 * latest wish behind it. Five taps while a slow request is outstanding
 * become one follow-up carrying the final state, or none if the taps
 * ended where the server already is. Nothing here ever retries a failed
 * write: the rate limiter counts every attempt, and a retry loop behind
 * an optimistic UI is how one tap turns into a lockout.
 */

export type SendResult<T> = { ok: true; value?: T } | { ok: false; reason: string }

export interface LatestWinsOptions<T> {
  /** What the server is known to hold right now. */
  confirmed: T
  /**
   * Sends one change. Gets the state to reach and the state the server is
   * known to hold — a toggle endpoint (ticket vote) needs the second to
   * know whether a request is needed at all.
   */
  send: (next: T, confirmed: T) => Promise<SendResult<T>>
  /** Every change to what the screen should show. */
  onChange: (value: T) => void
  /** A write failed and the screen has been put back. */
  onError: (reason: string) => void
  onBusyChange?: (busy: boolean) => void
  equals?: (a: T, b: T) => boolean
}

export class LatestWinsWriter<T> {
  private confirmed: T
  private wanted: T
  private inFlight = false
  private readonly opts: LatestWinsOptions<T>
  private readonly equals: (a: T, b: T) => boolean

  constructor(opts: LatestWinsOptions<T>) {
    this.opts = opts
    this.confirmed = opts.confirmed
    this.wanted = opts.confirmed
    this.equals = opts.equals ?? Object.is
  }

  /** The screen moves now; the request follows. */
  submit(next: T): Promise<void> {
    this.wanted = next
    this.opts.onChange(next)
    return this.pump()
  }

  /** New server truth from outside (a refresh), when nothing is pending. */
  reset(confirmed: T) {
    if (this.inFlight) return
    this.confirmed = confirmed
    this.wanted = confirmed
  }

  private async pump(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    this.opts.onBusyChange?.(true)
    try {
      while (!this.equals(this.wanted, this.confirmed)) {
        const target = this.wanted
        let result: SendResult<T>
        try {
          result = await this.opts.send(target, this.confirmed)
        } catch {
          result = { ok: false, reason: '' }
        }
        if (!result.ok) {
          // Back to the last thing the server agreed to, and drop whatever
          // was queued behind the failure: it was built on a state that
          // never happened.
          this.wanted = this.confirmed
          this.opts.onChange(this.confirmed)
          this.opts.onError(result.reason)
          return
        }
        // The server's own answer wins over what was sent — it holds the
        // constraint (one vote per user), the client only hopes.
        this.confirmed = result.value !== undefined ? result.value : target
        if (this.equals(this.wanted, target)) {
          this.wanted = this.confirmed
          this.opts.onChange(this.confirmed)
        }
      }
    } finally {
      this.inFlight = false
      this.opts.onBusyChange?.(false)
    }
  }
}

/** Just enough of next-intl's translator to be stubbed in a test. */
export interface ReasonTranslator {
  (key: string): string
  has(key: string): boolean
}

/**
 * The sentence to show for a failed response.
 *
 * Keyed on the response's `code` first (src/lib/apiError.ts sends the
 * catalogue key beside the sentence), so the reason reads in the viewer's
 * current language even if it changed since the page loaded. Then the
 * server's own sentence; then the caller's fallback — never a bare
 * "something went wrong" when the server said what.
 */
export async function reasonFromResponse(
  res: Response | null,
  t: ReasonTranslator,
  fallback: string,
  networkMessage: string = fallback
): Promise<string> {
  // No response at all: nothing reached the server, which is worth
  // saying differently from a refusal — the fix is the connection.
  if (!res) return networkMessage
  let body: { code?: unknown; error?: unknown } | null = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const code = typeof body?.code === 'string' ? body.code : null
  if (code && t.has(code)) return t(code)
  if (typeof body?.error === 'string' && body.error.trim()) return body.error
  return fallback
}

/**
 * A fetch that answers null instead of throwing when the network is gone,
 * so every caller handles one failure shape.
 */
export async function tryFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/** How long an undo stays on offer. Long enough to read and reach by keyboard. */
export const UNDO_WINDOW_MS = 8000

export interface UndoableRequest {
  url: string
  method: 'DELETE' | 'POST' | 'PATCH'
}

export interface UndoableAction {
  /**
   * Names what is being removed, for screens that did not start the
   * action but must hide it meanwhile — `task:<id>` on the vehicle page
   * after the task page sent somebody back there.
   */
  key: string
  request: UndoableRequest
  onUndo?: () => void
  onCommitted?: () => void
  onFailed?: (res: Response | null) => void
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

/**
 * Destructive actions wait before they happen, instead of asking first.
 *
 * The request is only sent when the window closes, so Undo needs no
 * restore endpoint — nothing has been deleted yet. Two consequences are
 * handled here rather than left to each caller:
 *
 * - A page that is **closed** inside the window still commits: `flush()`
 *   runs on `pagehide` with `keepalive`, which outlives the page. Leaving
 *   the deletion undone would show "Deleted" and then bring the thing
 *   back on the next visit.
 * - Client-side navigation inside the window changes nothing, because
 *   the queue lives in the root layout, above every page.
 */
export class UndoQueue {
  private readonly pending = new Map<string, UndoableAction>()
  /** Sent and not yet answered: still hidden, no longer undoable. */
  private readonly committing = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private readonly fetcher: Fetcher

  constructor(fetcher: Fetcher = (url, init) => fetch(url, init)) {
    this.fetcher = fetcher
  }

  add(action: UndoableAction) {
    this.pending.set(action.key, action)
    this.emit()
  }

  isPending(key: string): boolean {
    return this.pending.has(key)
  }

  /** Undo is still possible — nothing has been sent. */
  canUndo(key: string): boolean {
    return this.pending.has(key) && !this.committing.has(key)
  }

  keys(): string[] {
    return Array.from(this.pending.keys())
  }

  undo(key: string): boolean {
    const action = this.pending.get(key)
    if (!action || this.committing.has(key)) return false
    this.pending.delete(key)
    this.emit()
    action.onUndo?.()
    return true
  }

  async commit(key: string): Promise<boolean> {
    const action = this.pending.get(key)
    // Expiry and the dismiss button can both land on one action; the
    // second must not send the request again.
    if (!action || this.committing.has(key)) return false
    this.committing.add(key)
    let res: Response | null = null
    try {
      res = await this.fetcher(action.request.url, { method: action.request.method })
    } catch {
      res = null
    }
    // Only now does the thing stop being hidden-but-present: removing the
    // key before the answer would flash the row back for the length of
    // the request.
    this.pending.delete(key)
    this.committing.delete(key)
    this.emit()
    if (res?.ok) {
      action.onCommitted?.()
      return true
    }
    action.onFailed?.(res)
    return false
  }

  /** The page is going away: send everything still waiting, now. */
  flush() {
    for (const [key, action] of Array.from(this.pending.entries())) {
      if (this.committing.has(key)) continue
      try {
        void this.fetcher(action.request.url, { method: action.request.method, keepalive: true })
      } catch {
        // Nothing useful to do while the page is being torn down.
      }
    }
    this.pending.clear()
    this.committing.clear()
  }

  /** An arrow property so it is one stable function, as `useSyncExternalStore` wants. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}
