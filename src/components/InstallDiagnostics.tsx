'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Why this browser is not offering to install the app.
 *
 * The honest limit first: a browser never says *why* it withheld an
 * install prompt, so this cannot report a cause. What it can do is check
 * the three things that are ours to get right — a secure connection, a
 * manifest carrying the icons Chromium requires, and a registered
 * service worker — on the device in front of the person, which is the
 * only place the answer lives. If all three read yes and there is still
 * no offer, the remaining explanations are the browser's own: it is
 * already installed, it is a browser that cannot install web apps, or
 * the person dismissed an earlier prompt and it has not come back yet.
 *
 * It exists because the alternative was rendering nothing at all. An
 * install card with a heading and empty space under it cannot be told
 * apart from a broken one, and that is exactly how a manifest with no
 * PNG icons — valid, and never installable — went unnoticed.
 */

interface Check {
  id: 'https' | 'manifest' | 'worker' | 'offered'
  ok: boolean
}

export default function InstallDiagnostics({ offered }: { offered: boolean }) {
  const t = useTranslations('install')
  const [checks, setChecks] = useState<Check[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const results: Check[] = []

      // Installability needs a secure context. localhost counts as one,
      // which is why a thing that works in dev can fail on a deployment
      // reached over plain http.
      results.push({
        id: 'https',
        ok: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
      })

      // The check this is really here for. Chromium wants a 192 and a 512
      // PNG; an SVG-only manifest is valid and simply never installable.
      let manifestOk = false
      try {
        const res = await fetch('/manifest.json', { cache: 'no-store' })
        const manifest = (await res.json()) as { icons?: { sizes?: string; type?: string }[] }
        const has = (size: string) =>
          manifest.icons?.some((icon) => icon.sizes === size && icon.type === 'image/png') ?? false
        manifestOk = res.ok && has('192x192') && has('512x512')
      } catch {
        manifestOk = false
      }
      results.push({ id: 'manifest', ok: manifestOk })

      let workerOk = false
      try {
        const registration = await navigator.serviceWorker?.getRegistration()
        workerOk = Boolean(registration?.active)
      } catch {
        workerOk = false
      }
      results.push({ id: 'worker', ok: workerOk })

      // Passed in rather than re-derived: the component above owns it,
      // and re-reading the global here could disagree with what the
      // person is looking at.
      results.push({ id: 'offered', ok: offered })

      if (!cancelled) setChecks(results)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [offered])

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">{t('whyTitle')}</summary>
      {checks === null ? (
        <p className="mt-2 text-xs text-ink-faint">{t('checking')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {checks.map((check) => (
            <li key={check.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-muted">{t(`check.${check.id}`)}</span>
              {/* The word, not just a colour: this is a status list read
                  by somebody already looking for a problem. */}
              <span className={`badge ${check.ok ? 'badge-success' : 'badge-warn'}`}>
                {check.ok ? t('checkYes') : t('checkNo')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
