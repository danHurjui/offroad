import { NextResponse } from 'next/server'
import { buildId } from '@/lib/version'
import { serviceWorkerSource } from '@/lib/serviceWorker'

/**
 * Serves the service worker with this build's id baked into its cache
 * name.
 *
 * A file in `public/` cannot do this: it is byte-identical every deploy,
 * so the browser never reinstalls the worker, so a new cache name could
 * never take effect. See src/lib/serviceWorker.ts for the full reasoning.
 *
 * `no-cache` on the script itself is what makes the update check work at
 * all — the browser must revalidate `/sw.js` to notice the bytes have
 * changed. (Chromium ignores a long max-age on a worker script by rule,
 * but saying so explicitly means the behaviour does not depend on a rule
 * other browsers may apply differently.)
 */
export const dynamic = 'force-static'

export function GET() {
  return new NextResponse(serviceWorkerSource(buildId()), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate',
      // The worker is served from the root, so it already controls the
      // whole origin; this states it rather than relying on the default.
      'Service-Worker-Allowed': '/',
    },
  })
}
