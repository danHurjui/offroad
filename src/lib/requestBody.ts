import { NextResponse } from 'next/server'
import { apiError, apiErrorMessage } from './apiError'
import type { NextRequest } from 'next/server'

/**
 * `req.json()` is typed `any`, and every route here does its own runtime
 * validation on the fields it reads. Keeping the same loose element type
 * preserves that contract; tightening it to `unknown` would only push
 * casts into 26 call sites without adding real safety.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = Record<string, any>

type BodyOk = { ok: true; body: JsonBody; error?: never }
type BodyFail = { ok: false; body?: never; error: NextResponse }
export type BodyResult = BodyOk | BodyFail

/**
 * Shared JSON body reader for API routes.
 *
 * `req.json()` throws on a malformed or empty body. Route handlers wrap
 * their work in a try/catch that returns a 500, so an unparseable body —
 * a client bug, not a server fault — used to surface as "Internal server
 * error". Read the body with this first, outside that catch, so bad input
 * gets a 400:
 *
 *   const parsed = await readJsonBody(req)
 *   if (!parsed.ok) return parsed.error
 *   const body = parsed.body
 *
 * A non-object body (`"a string"`, `[1,2]`, `null`) is rejected too — every
 * route here destructures named fields off an object.
 */
export async function readJsonBody(req: NextRequest): Promise<BodyResult> {
  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return {
      ok: false,
      error: await apiError('bodyNotJson', 400),
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: await apiError('bodyNotObject', 400),
    }
  }
  if (hasNullByte(parsed)) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: await apiErrorMessage('bodyNullBytes'), code: 'bodyNullBytes' },
        { status: 400 },
      ),
    }
  }
  return { ok: true, body: parsed as JsonBody }
}

/**
 * Postgres rejects \u0000 inside a text value, so a string carrying one
 * fails at the insert and surfaces as a 500 from the route's catch. It is
 * never meaningful input, so reject it here as the client error it is.
 */
function hasNullByte(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (typeof value === 'string') return value.includes('\u0000')
  if (Array.isArray(value)) return value.some((v) => hasNullByte(v, depth + 1))
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((v) => hasNullByte(v, depth + 1))
  }
  return false
}

type FormOk = { ok: true; form: FormData; error?: never }
type FormFail = { ok: false; form?: never; error: NextResponse }
export type FormResult = FormOk | FormFail

/**
 * Multipart counterpart to readJsonBody. `req.formData()` throws when the
 * request isn't multipart (or the body is truncated), which the route's
 * try/catch would otherwise report as a 500 rather than the client error
 * it is.
 */
export async function readFormData(req: NextRequest): Promise<FormResult> {
  try {
    return { ok: true, form: await req.formData() }
  } catch {
    return {
      ok: false,
      error: NextResponse.json(
        { error: await apiErrorMessage('bodyNotMultipart'), code: 'bodyNotMultipart' },
        { status: 400 },
      ),
    }
  }
}
