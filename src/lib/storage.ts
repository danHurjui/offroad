import { mkdir, writeFile, unlink, readFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { put, del, list } from '@vercel/blob'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? './public/uploads'

/**
 * Vercel's serverless functions have an ephemeral, non-shared filesystem —
 * a file written to local disk in one invocation is not guaranteed to be
 * there for the next, so local-disk storage only works for `next dev` /
 * a persistent single-node deployment. Setting BLOB_READ_WRITE_TOKEN
 * (from `vercel blob store add`, or automatically when a Blob store is
 * linked to the project) switches every read/write in this file to
 * Vercel Blob instead, with no other code changes needed — see DEPLOY.md.
 */
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN)

export class StorageError extends Error {}

function safeSegment(segment: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    throw new StorageError(`Invalid path segment: ${segment}`)
  }
  return segment
}

function resolveLocalPath(storagePath: string): string {
  const resolved = path.resolve(UPLOADS_DIR, storagePath)
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    throw new StorageError('Invalid storage path')
  }
  return resolved
}

/**
 * Writes a file under <userId>/<vehicleId>/<uuid>, scoped so one user's
 * uploads never collide with another's. Returns the "storage key" to
 * persist on the row (NOT a public URL — files are only ever served
 * through /api/uploads/[...path], which re-checks vehicle access before
 * streaming, whether the bytes come from local disk or Blob).
 */
export async function saveUpload(
  userId: string,
  vehicleId: string,
  originalName: string,
  buffer: Buffer,
  contentType?: string
): Promise<string> {
  safeSegment(userId)
  safeSegment(vehicleId)
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '')
  const filename = `${randomUUID()}${ext}`
  const key = `${userId}/${vehicleId}/${filename}`

  try {
    if (useBlob) {
      // addRandomSuffix: false — the uuid filename is already unique, and
      // a stable key is what lets deleteUpload()/readUpload() find this
      // blob again by exact pathname.
      await put(key, buffer, { access: 'public', addRandomSuffix: false, contentType })
    } else {
      const dir = path.join(UPLOADS_DIR, userId, vehicleId)
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, filename), buffer)
    }
  } catch (e) {
    throw new StorageError(`Failed to save upload: ${(e as Error).message}`)
  }

  return key
}

async function findBlob(storagePath: string) {
  const { blobs } = await list({ prefix: storagePath, limit: 1 })
  return blobs.find((b) => b.pathname === storagePath) ?? null
}

/** Reads a stored file's bytes back, from Blob or local disk depending on which backend saved it. */
export async function readUpload(storagePath: string): Promise<{ buffer: Buffer; contentType: string | null }> {
  if (useBlob) {
    const blob = await findBlob(storagePath)
    if (!blob) throw new StorageError('Not found')
    const res = await fetch(blob.url)
    if (!res.ok) throw new StorageError('Failed to fetch from blob storage')
    // list()'s result doesn't carry contentType (only put()/head() do) —
    // Blob serves the file with the Content-Type it was uploaded with, so
    // the fetch response's own header is the simplest source of truth.
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') }
  }

  try {
    const buffer = await readFile(resolveLocalPath(storagePath))
    return { buffer, contentType: null }
  } catch (e) {
    if (e instanceof StorageError) throw e
    throw new StorageError('Not found')
  }
}

export async function deleteUpload(storagePath: string): Promise<void> {
  if (useBlob) {
    try {
      const blob = await findBlob(storagePath)
      if (blob) await del(blob.url)
    } catch {
      // Already gone, or Blob is briefly unreachable — deleting a DB row
      // whose file can't be found should not 500 (matches local-disk
      // behaviour below).
    }
    return
  }

  try {
    await unlink(resolveLocalPath(storagePath))
  } catch {
    // Already gone — deleting a DB row whose file was manually removed
    // should not 500.
  }
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4MB — stays under Vercel's ~4.5MB serverless request body cap
export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
