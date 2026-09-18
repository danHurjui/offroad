import { SKIP_WAITING_MESSAGE, serviceWorkerSource, shellCacheName } from '@/lib/serviceWorker'

/**
 * The worker runs in a context nothing here compiles or type-checks, the
 * same as `THEME_SCRIPT` and `INSTALL_PROMPT_SCRIPT` — so it is executed
 * against a stub rather than trusted by eye.
 *
 * Three of the behaviours below were silently absent before RL-043 and
 * would be absent again the moment somebody "tidied" this: a cache named
 * after the build, an activate that can actually match a stale cache, and
 * an install that does *not* seize control of the page.
 */

type Handler = (event: Record<string, unknown>) => void

function run(buildId: string) {
  const handlers: Record<string, Handler> = {}
  const deleted: string[] = []
  let skipWaitingCalls = 0
  let claimCalls = 0

  const cacheKeys = [
    shellCacheName(buildId),
    'riglog-shell-oldbuild',
    // Something else in the same origin's cache storage. Not ours to bin.
    'some-other-app-cache',
  ]

  const cache = {
    addAll: jest.fn().mockResolvedValue(undefined),
    put: jest.fn().mockResolvedValue(undefined),
  }

  const caches = {
    open: jest.fn().mockResolvedValue(cache),
    keys: jest.fn().mockResolvedValue(cacheKeys),
    delete: jest.fn((key: string) => {
      deleted.push(key)
      return Promise.resolve(true)
    }),
    match: jest.fn().mockResolvedValue(undefined),
  }

  const self = {
    addEventListener: (name: string, handler: Handler) => {
      handlers[name] = handler
    },
    skipWaiting: () => {
      skipWaitingCalls += 1
    },
    clients: {
      claim: () => {
        claimCalls += 1
      },
      openWindow: jest.fn(),
    },
    registration: { showNotification: jest.fn() },
  }

  const fetchStub = jest.fn().mockResolvedValue({ clone: () => ({}) })

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', serviceWorkerSource(buildId))(self, caches, fetchStub)

  return {
    handlers,
    deleted,
    caches,
    fetchStub,
    get skipWaitingCalls() {
      return skipWaitingCalls
    },
    get claimCalls() {
      return claimCalls
    },
  }
}

/** Runs an event handler and settles whatever it passed to waitUntil. */
async function fire(handlers: Record<string, Handler>, name: string, extra = {}) {
  const waited: unknown[] = []
  const responded: unknown[] = []
  handlers[name]({
    waitUntil: (p: unknown) => waited.push(p),
    respondWith: (p: unknown) => responded.push(p),
    ...extra,
  })
  await Promise.all(waited.map((p) => Promise.resolve(p).catch(() => {})))
  return { waited, responded }
}

describe('the generated worker', () => {
  it('names its cache after the build', () => {
    expect(serviceWorkerSource('abc1234')).toContain("'riglog-shell-abc1234'")
  })

  /**
   * The load-bearing property: a browser installs a new worker only when
   * the script's **bytes** change. The old static file was byte-identical
   * every deploy, so no new cache name could ever have taken effect even
   * if one had been written.
   */
  it('differs between builds, which is what makes a browser reinstall it', () => {
    expect(serviceWorkerSource('aaaaaaa')).not.toEqual(serviceWorkerSource('bbbbbbb'))
  })

  it('registers the handlers the app depends on', () => {
    const { handlers } = run('abc1234')
    expect(Object.keys(handlers).sort()).toEqual(
      ['activate', 'fetch', 'install', 'message', 'notificationclick', 'push'].sort()
    )
  })

  /**
   * Installability requires a fetch handler. Nothing else in the app
   * checks this, and losing it turns the install offer off with no error
   * anywhere — the exact failure mode the SVG-only manifest had.
   */
  it('has a fetch handler at all', () => {
    expect(run('abc1234').handlers.fetch).toBeDefined()
  })
})

describe('install', () => {
  it('caches the shell', async () => {
    const sw = run('abc1234')
    await fire(sw.handlers, 'install')
    expect(sw.caches.open).toHaveBeenCalledWith('riglog-shell-abc1234')
  })

  /**
   * It must NOT take control here. Doing so replaces the page under
   * somebody who is part-way through writing up a job. The new worker
   * waits until the person accepts the reload.
   */
  it('does not seize control of open pages', async () => {
    const sw = run('abc1234')
    await fire(sw.handlers, 'install')
    expect(sw.skipWaitingCalls).toBe(0)
  })
})

describe('taking over on request', () => {
  it('skips waiting when the page asks it to', () => {
    const sw = run('abc1234')
    sw.handlers.message({ data: SKIP_WAITING_MESSAGE })
    expect(sw.skipWaitingCalls).toBe(1)
  })

  it('ignores any other message', () => {
    const sw = run('abc1234')
    sw.handlers.message({ data: 'something-else' })
    sw.handlers.message({})
    expect(sw.skipWaitingCalls).toBe(0)
  })
})

describe('activate', () => {
  /**
   * This is the cleanup that could never fire before: the cache name was
   * pinned to `riglog-shell-v1` and never changed, so the filter matched
   * nothing and every deploy layered on top of the last.
   */
  it('evicts the previous build, keeps this one', async () => {
    const sw = run('abc1234')
    await fire(sw.handlers, 'activate')
    expect(sw.deleted).toContain('riglog-shell-oldbuild')
    expect(sw.deleted).not.toContain('riglog-shell-abc1234')
  })

  it('leaves caches that are not ours alone', async () => {
    const sw = run('abc1234')
    await fire(sw.handlers, 'activate')
    expect(sw.deleted).not.toContain('some-other-app-cache')
  })

  it('claims open clients', async () => {
    const sw = run('abc1234')
    await fire(sw.handlers, 'activate')
    expect(sw.claimCalls).toBe(1)
  })
})

describe('fetch', () => {
  it('answers GETs', async () => {
    const sw = run('abc1234')
    const { responded } = await fire(sw.handlers, 'fetch', {
      request: { method: 'GET', url: 'https://riglog.ro/' },
    })
    expect(responded).toHaveLength(1)
  })

  /** A cached POST would replay somebody's write. */
  it('never touches a mutating request', async () => {
    const sw = run('abc1234')
    const { responded } = await fire(sw.handlers, 'fetch', {
      request: { method: 'POST', url: 'https://riglog.ro/api/tasks' },
    })
    expect(responded).toHaveLength(0)
    expect(sw.fetchStub).not.toHaveBeenCalled()
  })
})
