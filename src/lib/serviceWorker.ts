/**
 * The service worker, as source this app can put a build id into.
 *
 * ## Why it is no longer a static file
 *
 * It used to be `public/sw.js` with `CACHE_NAME = 'riglog-shell-v1'` — a
 * name pinned at RL-010 and never bumped again. Two things followed from
 * that, and both were invisible:
 *
 * The `activate` handler deletes every cache whose key is not the current
 * name. With a name that never changes, that cleanup could never match
 * anything, so it was dead code and the shell cache simply accumulated
 * across every deploy since.
 *
 * And a browser only installs a new worker when the **bytes of the script
 * change**. A static file that is byte-identical every deploy is a worker
 * that never reinstalls, so there was no moment at which a new cache name
 * could have taken effect even if one had been written.
 *
 * Serving it from a route (`src/app/sw.js/route.ts`) with the build id
 * interpolated fixes both at once: the bytes differ per deploy, so the
 * worker reinstalls, so `activate` runs, so the previous build's cache is
 * evicted by the code that was always there waiting to do it.
 *
 * ## Why it is a string
 *
 * Same reason as `THEME_SCRIPT` and `INSTALL_PROMPT_SCRIPT`: it runs in a
 * context this app's bundler does not compile. Nothing type-checks it, so
 * `serviceWorker.test.ts` executes it against a stub `self` rather than
 * trusting it by eye.
 */

/**
 * The cache this build owns. Every other `riglog-shell-*` cache is a
 * previous build's and gets dropped on activate.
 */
export function shellCacheName(buildId: string): string {
  return `riglog-shell-${buildId}`
}

/** Message a waiting worker to take over, sent when somebody accepts the reload. */
export const SKIP_WAITING_MESSAGE = 'riglog:skip-waiting'

export function serviceWorkerSource(buildId: string): string {
  return `// Generated per build — see src/lib/serviceWorker.ts.
// RL-010: minimal offline app shell. Caches the shell on install; on
// fetch, tries the network first and falls back to cache so the last
// loaded page (with its data) is visible offline. New data cannot be
// saved offline — write requests are never cached (see below).
//
// RL-043: the cache is named after the build, so activate below actually
// evicts the previous build's copy instead of layering on top of it.
const CACHE_NAME = '${shellCacheName(buildId)}'
const SHELL_URLS = ['/', '/dashboard']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  )
  // Deliberately NOT skipWaiting() here. This worker waits until the page
  // asks for it, so somebody mid-way through writing up a job does not
  // have the app swapped underneath them. AppUpdateNotice offers the
  // reload and sends the message below when they accept.
})

self.addEventListener('message', (event) => {
  if (event.data === '${SKIP_WAITING_MESSAGE}') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Only this app's shell caches. Anything else in the origin's
          // cache storage belongs to something else and is not ours to bin.
          .filter((key) => key.startsWith('riglog-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// RL-023: shows a followed-project update. Payload is the JSON built by
// src/lib/webpush.ts's sendPushNotification — {title, body, url}.
self.addEventListener('push', (event) => {
  let payload = { title: 'RigLog', body: 'A project you follow was updated.', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch (e) {
    // non-JSON payload — fall back to the default text above
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon.svg',
      data: { url: payload.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(self.clients.openWindow(url))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return // never cache mutating requests

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  )
})
`
}
