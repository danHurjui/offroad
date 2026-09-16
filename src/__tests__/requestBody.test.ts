import { readJsonBody } from '@/lib/requestBody'

function req(json: () => Promise<unknown>) {
  return { json } as never
}

describe('readJsonBody', () => {
  it('returns the parsed object for a valid body', async () => {
    const parsed = await readJsonBody(req(() => Promise.resolve({ name: 'Winch', costRon: 10 })))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.body).toEqual({ name: 'Winch', costRon: 10 })
  })

  // Regression: an unparseable body used to reach the route's try/catch and
  // come back as a 500, blaming the server for a client-side error.
  it('returns 400, not 500, when the body is not valid JSON', async () => {
    const parsed = await readJsonBody(req(() => Promise.reject(new SyntaxError('bad json'))))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.status).toBe(400)
      await expect(parsed.error.json()).resolves.toEqual({ error: 'Request body must be valid JSON' })
    }
  })

  it.each([
    ['a string', 'hello'],
    ['an array', [1, 2, 3]],
    ['null', null],
    ['a number', 42],
  ])('rejects %s body with 400', async (_label, value) => {
    const parsed = await readJsonBody(req(() => Promise.resolve(value)))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error.status).toBe(400)
  })

  // Regression: Postgres rejects \u0000 in text, which surfaced as a 500.
  it('rejects a null byte in a top-level string with 400', async () => {
    const parsed = await readJsonBody(req(() => Promise.resolve({ name: 'ab\u0000cd' })))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.status).toBe(400)
      await expect(parsed.error.json()).resolves.toEqual({
        error: 'Request body must not contain null bytes',
      })
    }
  })

  it('rejects a null byte nested in an object or array', async () => {
    const nested = await readJsonBody(req(() => Promise.resolve({ a: { b: { c: 'x\u0000' } } })))
    expect(nested.ok).toBe(false)
    const inArray = await readJsonBody(req(() => Promise.resolve({ waypoints: [{ note: 'x\u0000' }] })))
    expect(inArray.ok).toBe(false)
  })

  it('accepts ordinary unicode, including Romanian diacritics and emoji', async () => {
    const parsed = await readJsonBody(req(() => Promise.resolve({ name: 'Șasiu îmbunătățit 🚙' })))
    expect(parsed.ok).toBe(true)
  })

  it('does not recurse without bound on a deeply nested body', async () => {
    let deep: Record<string, unknown> = { note: 'x\u0000' }
    for (let i = 0; i < 50; i++) deep = { nested: deep }
    await expect(readJsonBody(req(() => Promise.resolve(deep)))).resolves.toBeDefined()
  })
})
