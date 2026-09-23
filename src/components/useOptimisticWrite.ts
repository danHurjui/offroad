'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from './Toaster'
import {
  LatestWinsWriter,
  reasonFromResponse,
  type ReasonTranslator,
  type SendResult,
} from '@/lib/writeFeedback'

/**
 * The failure sentence for a response, in the viewer's language. See
 * `reasonFromResponse` for the order it tries things in.
 */
export function useFailureReason() {
  const t = useTranslations('apiError') as unknown as ReasonTranslator
  const tc = useTranslations('common')
  const network = tc('networkError')
  return useCallback(
    (res: Response | null, fallback: string) => reasonFromResponse(res, t, fallback, network),
    [t, network]
  )
}

/**
 * RL-034: a value the screen changes before the server does.
 *
 * `value` moves the moment `submit` is called. If the write fails, it
 * returns to the last value the server confirmed and a toast says why,
 * from the response's own code. Rules on what may use this — never a
 * gated action — are in src/lib/writeFeedback.ts.
 *
 * `serverValue` is the prop the page rendered with; a `router.refresh()`
 * that brings a newer one is adopted whenever nothing is in flight. It
 * must be JSON-serialisable — that is how a change is detected.
 */
export function useOptimisticWrite<T>({
  serverValue,
  send,
  fallbackError,
  equals,
}: {
  serverValue: T
  send: (next: T, confirmed: T) => Promise<SendResult<T>>
  fallbackError: string
  equals?: (a: T, b: T) => boolean
}) {
  const toast = useToast()
  const [value, setValue] = useState(serverValue)
  const [busy, setBusy] = useState(false)

  // The writer outlives renders; the latest `send` and messages reach it
  // through refs rather than by rebuilding it and losing what is queued.
  const sendRef = useRef(send)
  sendRef.current = send
  const fallbackRef = useRef(fallbackError)
  fallbackRef.current = fallbackError

  const writerRef = useRef<LatestWinsWriter<T> | null>(null)
  if (!writerRef.current) {
    writerRef.current = new LatestWinsWriter<T>({
      confirmed: serverValue,
      send: (next, confirmed) => sendRef.current(next, confirmed),
      onChange: setValue,
      onError: (reason) => toast.error(reason || fallbackRef.current),
      onBusyChange: setBusy,
      equals,
    })
  }

  // Adopt a newer server value, but only when it actually changed.
  // Callers pass object literals (`{ voted, count }`), which are new on
  // every render, so identity would re-run this every time and loop; the
  // values here are small and plain, so their JSON is the comparison.
  const busyRef = useRef(false)
  busyRef.current = busy
  const serverKey = JSON.stringify(serverValue)
  const latestServer = useRef(serverValue)
  latestServer.current = serverValue
  useEffect(() => {
    if (busyRef.current) return
    writerRef.current?.reset(latestServer.current)
    setValue(latestServer.current)
  }, [serverKey])

  const submit = useCallback((next: T) => writerRef.current!.submit(next), [])
  return { value, submit, busy }
}
