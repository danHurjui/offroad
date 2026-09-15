import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? './public/uploads'

export class StorageError extends Error {}

function safeSegment(segment: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    throw new StorageError(`Invalid path segment: ${segment}`)
  }
  return segment
}

/**
 * Writes a file under UPLOADS_DIR/<userId>/<vehicleId>/, scoped so one
 * user's uploads never collide with another's. Returns the relative
 * "storage path" to persist on the row (NOT a public URL — files are
 * only ever served through /api/uploads/[...path], which re-checks
 * vehicle access before streaming).
 */
export async function saveUpload(
  userId: string,
  vehicleId: string,
  originalName: string,
  buffer: Buffer
): Promise<string> {
  safeSegment(userId)
  safeSegment(vehicleId)
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '')
  const filename = `${randomUUID()}${ext}`
  const dir = path.join(UPLOADS_DIR, userId, vehicleId)
  const filePath = path.join(dir, filename)

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, buffer)
  } catch (e) {
    throw new StorageError(`Failed to save upload: ${(e as Error).message}`)
  }

  return `${userId}/${vehicleId}/${filename}`
}

export async function deleteUpload(storagePath: string): Promise<void> {
  const resolved = path.resolve(UPLOADS_DIR, storagePath)
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    throw new StorageError('Refusing to delete outside uploads dir')
  }
  try {
    await unlink(resolved)
  } catch {
    // Already gone — deleting a DB row whose file was manually removed
    // should not 500.
  }
}

export function resolveUploadPath(storagePath: string): string {
  const resolved = path.resolve(UPLOADS_DIR, storagePath)
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    throw new StorageError('Invalid storage path')
  }
  return resolved
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB, matches RL-016
export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
