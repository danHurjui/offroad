import fs from 'fs'
import path from 'path'
import {
  LatestWinsWriter,
  UndoQueue,
  reasonFromResponse,
  type ReasonTranslator,
  type SendResult,
} from '@/lib/writeFeedback'

/** A promise the test resolves by hand, to hold a request "in flight". */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function writer<T>(confirmed: T, send: (next: T, confirmed: T) => Promise<SendResult<T>>) {
  const shown: T[] = []
  const errors: string[] = []
  const w = new LatestWinsWriter<T>({
    confirmed,
    send,
    onChange: (v) => shown.push(v),
    onError: (r) => errors.push(r),
  })
  return { w, shown, errors }
}

describe('LatestWinsWriter', () => {
  it('shows the change before the request answers', async () => {
    const gate = deferred<SendResult<string>>()
    const { w, shown } = writer('PLANNED', () => gate.promise)
    const done = w.submit('DONE')
    expect(shown).toEqual(['DONE'])
    gate.resolve({ ok: true })
    await done
    expect(shown[shown.length - 1]).toBe('DONE')
  })

  it('puts the last confirmed value back, with the reason, when the write fails', async () => {
    const { w, shown, errors } = writer('PLANNED', async () => ({ ok: false, reason: 'Not allowed' }))
    await w.submit('DONE')
    expect(shown).toEqual(['DONE', 'PLANNED'])
    expect(errors).toEqual(['Not allowed'])
  })

  it('treats a thrown send (network gone) as a failure, not a crash', async () => {
    const { w, shown, errors } = writer('A', async () => {
      throw new Error('offline')
    })
    await w.submit('B')
    expect(shown[shown.length - 1]).toBe('A')
    expect(errors).toHaveLength(1)
  })

  it('turns a burst of taps into at most one follow-up request carrying the last one', async () => {
    const calls: string[] = []
    const gates: ReturnType<typeof deferred<SendResult<string>>>[] = []
    const { w, shown } = writer('A', (next) => {
      calls.push(next)
      const gate = deferred<SendResult<string>>()
      gates.push(gate)
      return gate.promise
    })

    const first = w.submit('B')
    void w.submit('C')
    void w.submit('D')
    void w.submit('E')
    expect(calls).toEqual(['B'])
    expect(shown[shown.length - 1]).toBe('E')

    gates[0].resolve({ ok: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toEqual(['B', 'E'])
    gates[1].resolve({ ok: true })
    await first
    expect(calls).toEqual(['B', 'E'])
  })

  it('sends nothing more when the taps end where the server already is', async () => {
    const calls: boolean[] = []
    const gate = deferred<SendResult<boolean>>()
    const { w } = writer(false, (next) => {
      calls.push(next)
      return gate.promise
    })
    const first = w.submit(true)
    void w.submit(false)
    void w.submit(true)
    gate.resolve({ ok: true })
    await first
    expect(calls).toEqual([true])
  })

  it('drops the queued wish when the request in front of it fails', async () => {
    const calls: string[] = []
    const gate = deferred<SendResult<string>>()
    const { w, shown } = writer('A', (next) => {
      calls.push(next)
      return gate.promise
    })
    const first = w.submit('B')
    void w.submit('C')
    gate.resolve({ ok: false, reason: 'no' })
    await first
    expect(calls).toEqual(['B'])
    expect(shown[shown.length - 1]).toBe('A')
  })

  it('takes the server’s answer over the value it sent', async () => {
    const { w, shown } = writer({ voted: false, count: 4 }, async () => ({
      ok: true,
      value: { voted: true, count: 9 },
    }))
    await w.submit({ voted: true, count: 5 })
    expect(shown[shown.length - 1]).toEqual({ voted: true, count: 9 })
  })

  it('never retries a failed write on its own', async () => {
    const send = jest.fn(async () => ({ ok: false as const, reason: 'rate limited' }))
    const { w } = writer('A', send)
    await w.submit('B')
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('reasonFromResponse', () => {
  const catalogue: Record<string, string> = { editOwnTasksOnly: 'You can only edit tasks you added.' }
  const t = Object.assign((key: string) => catalogue[key] ?? key, {
    has: (key: string) => key in catalogue,
  }) as ReasonTranslator

  const response = (body: unknown, status = 400) =>
    ({ status, ok: false, json: async () => body }) as unknown as Response

  it('prefers the server’s sentence, which has the message’s values filled in', async () => {
    const res = response({ code: 'amountNegative', error: 'costRon must be a non-negative number' })
    await expect(reasonFromResponse(res, t, 'fallback')).resolves.toBe('costRon must be a non-negative number')
  })

  it('falls back to the catalogue entry for a code that came without a sentence', async () => {
    const res = response({ code: 'editOwnTasksOnly' }, 403)
    await expect(reasonFromResponse(res, t, 'fallback')).resolves.toBe('You can only edit tasks you added.')
  })

  it('uses the caller’s fallback only when the server said nothing usable', async () => {
    const res = { status: 502, ok: false, json: async () => { throw new Error('html') } } as unknown as Response
    await expect(reasonFromResponse(res, t, 'fallback')).resolves.toBe('fallback')
  })

  it('says it is the connection when no response arrived', async () => {
    await expect(reasonFromResponse(null, t, 'fallback', 'Could not reach the server.')).resolves.toBe(
      'Could not reach the server.'
    )
  })
})

describe('UndoQueue', () => {
  const ok = { ok: true } as Response
  const request = { url: '/api/vehicles/v1/tasks/t1', method: 'DELETE' as const }

  it('sends nothing until the window closes', () => {
    const fetcher = jest.fn().mockResolvedValue(ok)
    const q = new UndoQueue(fetcher)
    q.add({ key: 'task:t1', request })
    expect(q.isPending('task:t1')).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('undo means the request is never sent', async () => {
    const fetcher = jest.fn().mockResolvedValue(ok)
    const onUndo = jest.fn()
    const q = new UndoQueue(fetcher)
    q.add({ key: 'task:t1', request, onUndo })
    expect(q.undo('task:t1')).toBe(true)
    expect(await q.commit('task:t1')).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    expect(onUndo).toHaveBeenCalled()
    expect(q.isPending('task:t1')).toBe(false)
  })

  it('commits once, however many things ask it to', async () => {
    let answer!: (r: Response) => void
    const fetcher = jest.fn(() => new Promise<Response>((r) => (answer = r)))
    const q = new UndoQueue(fetcher)
    q.add({ key: 'task:t1', request })
    const first = q.commit('task:t1')
    const second = q.commit('task:t1')
    // Mid-request: still hidden, and too late to undo.
    expect(q.isPending('task:t1')).toBe(true)
    expect(q.undo('task:t1')).toBe(false)
    answer(ok)
    expect(await first).toBe(true)
    expect(await second).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reports a refusal and stops hiding the thing', async () => {
    const refused = { ok: false, status: 403 } as Response
    const onFailed = jest.fn()
    const q = new UndoQueue(jest.fn().mockResolvedValue(refused))
    q.add({ key: 'photo:p1', request, onFailed })
    expect(await q.commit('photo:p1')).toBe(false)
    expect(onFailed).toHaveBeenCalledWith(refused)
    expect(q.isPending('photo:p1')).toBe(false)
  })

  it('treats a network error as a refusal with no response', async () => {
    const onFailed = jest.fn()
    const q = new UndoQueue(jest.fn().mockRejectedValue(new Error('offline')))
    q.add({ key: 'photo:p1', request, onFailed })
    await q.commit('photo:p1')
    expect(onFailed).toHaveBeenCalledWith(null)
  })

  it('sends everything still waiting, with keepalive, when the page goes away', () => {
    const fetcher = jest.fn().mockResolvedValue(ok)
    const q = new UndoQueue(fetcher)
    q.add({ key: 'task:t1', request })
    q.add({ key: 'photo:p1', request: { url: '/api/x/photos/p1', method: 'DELETE' } })
    q.flush()
    expect(fetcher).toHaveBeenCalledWith('/api/vehicles/v1/tasks/t1', { method: 'DELETE', keepalive: true })
    expect(fetcher).toHaveBeenCalledWith('/api/x/photos/p1', { method: 'DELETE', keepalive: true })
    expect(q.keys()).toEqual([])
  })

  it('tells subscribers when something starts or stops being hidden', async () => {
    const q = new UndoQueue(jest.fn().mockResolvedValue(ok))
    const listener = jest.fn()
    const unsubscribe = q.subscribe(listener)
    q.add({ key: 'a', request })
    q.undo('a')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    q.add({ key: 'b', request })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

/**
 * The rules RL-034 sets are about call sites, so they are checked against
 * the source: a component pasted from an older one would otherwise bring
 * its confirm dialog, or its optimistic vote, straight back.
 */
describe('RL-034 call sites', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', 'components', file), 'utf8')

  it.each(['DeleteTaskButton.tsx', 'TaskPhotos.tsx', 'CollaboratorsBoard.tsx'])(
    '%s offers undo instead of asking first',
    (file) => {
      const source = read(file)
      expect(source).not.toMatch(/\bconfirm\(/)
      expect(source).toMatch(/toast\.undoable\(/)
    }
  )

  it('keeps a vote pessimistic for an account the confirmed-address gate would refuse', () => {
    const source = read('TicketVoteButton.tsx')
    expect(source).toMatch(/if \(mayVote\)/)
    for (const page of ['tickets/page.tsx', 'tickets/[id]/page.tsx']) {
      const pageSource = fs.readFileSync(path.join(process.cwd(), 'src', 'app', page), 'utf8')
      expect(pageSource).toMatch(/mayVote=\{Boolean\(session\) && !isBlockedAsUnverified\(viewer\)\}/)
    }
  })

  it('never uses alert() to report a write', () => {
    for (const file of ['WishlistBoard.tsx', 'TaskPhotos.tsx', 'CollaboratorsBoard.tsx', 'FollowButton.tsx']) {
      expect(read(file)).not.toMatch(/\balert\(/)
    }
  })
})
