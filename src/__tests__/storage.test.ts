import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
  del: jest.fn(),
  list: jest.fn(),
}))

// storage.ts decides its backend once, at module load, from
// BLOB_READ_WRITE_TOKEN — every test here needs to control that before
// the module is (re-)required, hence jest.resetModules() + dynamic
// require() throughout instead of a static top-level import.
describe('storage.ts — local disk backend (BLOB_READ_WRITE_TOKEN unset)', () => {
  let tmpDir: string
  let storage: typeof import('@/lib/storage')

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'riglog-storage-test-'))
    process.env.UPLOADS_DIR = tmpDir
    delete process.env.BLOB_READ_WRITE_TOKEN
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-require is required to pick up the env var change above
    storage = require('@/lib/storage')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.UPLOADS_DIR
  })

  it('writes under userId/vehicleId and returns that as the storage key', async () => {
    const key = await storage.saveUpload('user1', 'veh1', 'photo.jpg', Buffer.from('hello'))
    expect(key).toMatch(/^user1\/veh1\/[a-f0-9-]+\.jpg$/)
    expect(existsSync(path.join(tmpDir, key))).toBe(true)
    expect(readFileSync(path.join(tmpDir, key), 'utf8')).toBe('hello')
  })

  it('rejects a userId/vehicleId containing path traversal characters', async () => {
    await expect(
      storage.saveUpload('../escape', 'veh1', 'photo.jpg', Buffer.from('x'))
    ).rejects.toThrow(storage.StorageError)
  })

  it('reads back exactly what was written, with no known content type', async () => {
    const key = await storage.saveUpload('user1', 'veh1', 'doc.pdf', Buffer.from('pdf-bytes'))
    const { buffer, contentType } = await storage.readUpload(key)
    expect(buffer.toString()).toBe('pdf-bytes')
    expect(contentType).toBeNull()
  })

  it('throws StorageError for a path that does not exist', async () => {
    await expect(storage.readUpload('user1/veh1/missing.jpg')).rejects.toThrow(storage.StorageError)
  })

  it('deletes a file and is a silent no-op on a second delete', async () => {
    const key = await storage.saveUpload('user1', 'veh1', 'photo.jpg', Buffer.from('x'))
    await storage.deleteUpload(key)
    expect(existsSync(path.join(tmpDir, key))).toBe(false)
    await expect(storage.deleteUpload(key)).resolves.toBeUndefined()
  })
})

describe('storage.ts — Vercel Blob backend (BLOB_READ_WRITE_TOKEN set)', () => {
  let storage: typeof import('@/lib/storage')
  let blob: { put: jest.Mock; del: jest.Mock; list: jest.Mock }

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-require is required to pick up the env var change above
    storage = require('@/lib/storage')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    blob = require('@vercel/blob')
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  it('uploads via put() with a stable key (no random suffix) and the given content type', async () => {
    blob.put.mockResolvedValue({ url: 'https://example.blob.vercel-storage.com/user1/veh1/abc.jpg' })
    const key = await storage.saveUpload('user1', 'veh1', 'photo.jpg', Buffer.from('x'), 'image/jpeg')
    expect(key).toMatch(/^user1\/veh1\/[a-f0-9-]+\.jpg$/)
    expect(blob.put).toHaveBeenCalledWith(
      key,
      expect.any(Buffer),
      expect.objectContaining({ access: 'public', addRandomSuffix: false, contentType: 'image/jpeg' })
    )
  })

  it('wraps a put() failure in StorageError', async () => {
    blob.put.mockRejectedValue(new Error('network down'))
    await expect(
      storage.saveUpload('user1', 'veh1', 'photo.jpg', Buffer.from('x'))
    ).rejects.toThrow(storage.StorageError)
  })

  it('reads by listing with the key as an exact-match prefix, then fetching the blob URL', async () => {
    blob.list.mockResolvedValue({
      blobs: [{ pathname: 'user1/veh1/abc.jpg', url: 'https://blob.example/abc.jpg' }],
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      // Buffer.from(str).buffer is the shared pool's *whole* backing
      // ArrayBuffer, not sliced to this buffer's bytes — use
      // TextEncoder for a tightly-sized one, matching what a real
      // fetch() Response.arrayBuffer() returns.
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('bytes').buffer),
      headers: { get: (key: string) => (key === 'content-type' ? 'image/jpeg' : null) },
    }) as never

    const { buffer, contentType } = await storage.readUpload('user1/veh1/abc.jpg')
    expect(blob.list).toHaveBeenCalledWith({ prefix: 'user1/veh1/abc.jpg', limit: 1 })
    expect(global.fetch).toHaveBeenCalledWith('https://blob.example/abc.jpg')
    expect(buffer.toString()).toBe('bytes')
    expect(contentType).toBe('image/jpeg')
  })

  it('throws StorageError when list() finds no matching blob', async () => {
    blob.list.mockResolvedValue({ blobs: [] })
    await expect(storage.readUpload('user1/veh1/missing.jpg')).rejects.toThrow(storage.StorageError)
  })

  it('ignores a prefix match that is a different (longer) pathname', async () => {
    // list({prefix}) does a prefix match, not exact — a key that merely
    // starts with the requested path must not be treated as a hit.
    blob.list.mockResolvedValue({
      blobs: [{ pathname: 'user1/veh1/abc.jpg.backup', url: 'https://blob.example/wrong' }],
    })
    await expect(storage.readUpload('user1/veh1/abc.jpg')).rejects.toThrow(storage.StorageError)
  })

  it('deletes the matching blob by URL', async () => {
    blob.list.mockResolvedValue({
      blobs: [{ pathname: 'user1/veh1/abc.jpg', url: 'https://blob.example/abc.jpg' }],
    })
    await storage.deleteUpload('user1/veh1/abc.jpg')
    expect(blob.del).toHaveBeenCalledWith('https://blob.example/abc.jpg')
  })

  it('is a silent no-op deleting a blob that no longer exists', async () => {
    blob.list.mockResolvedValue({ blobs: [] })
    await expect(storage.deleteUpload('user1/veh1/gone.jpg')).resolves.toBeUndefined()
    expect(blob.del).not.toHaveBeenCalled()
  })
})
