jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn(), list: jest.fn() }))

/**
 * An upload that fails says so in the log.
 *
 * Every route that writes a file catches StorageError and answers with a
 * translated 500, which is right for the person in front of it and left
 * the operator with a bare "could not save" and no cause — for a failure
 * whose usual cause is configuration, and therefore invisible from the
 * outside. This is the same hole email.ts closed by logging the provider's
 * own rejection.
 */
describe('storage diagnostics', () => {
  let errors: string[]
  let spy: jest.SpyInstance

  beforeEach(() => {
    errors = []
    spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '))
    })
    jest.resetModules()
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.VERCEL
  })

  afterEach(() => {
    spy.mockRestore()
    delete process.env.UPLOADS_DIR
    delete process.env.VERCEL
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  const load = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the backend is chosen at module load
    return require('@/lib/storage') as typeof import('@/lib/storage')
  }

  it('names the backend and the underlying error when a write fails', async () => {
    process.env.UPLOADS_DIR = '/dev/null/uploads' // ENOTDIR on mkdir
    const storage = load()

    await expect(storage.saveUpload('u1', 'v1', 'x.png', Buffer.from('hi'), 'image/png')).rejects.toThrow()

    const reported = errors.join('\n')
    expect(reported).toContain('[storage] save failed')
    expect(reported).toContain('local disk')
    expect(reported).toContain('/dev/null/uploads')
    // The cause itself, not just that something went wrong.
    expect(reported).toMatch(/ENOTDIR|EACCES|EROFS/)
  })

  it('throws StorageError, not a plain Error', async () => {
    // `class StorageError extends Error` does not survive a downlevel to
    // ES5: instanceof silently returns false and every route falls to its
    // generic branch instead. tsconfig pins the target for that reason.
    process.env.UPLOADS_DIR = '/dev/null/uploads'
    const storage = load()
    await expect(
      storage.saveUpload('u1', 'v1', 'x.png', Buffer.from('hi'), 'image/png')
    ).rejects.toBeInstanceOf(storage.StorageError)
  })

  it('calls out the Vercel-without-a-Blob-store case by name', () => {
    process.env.VERCEL = '1'
    const storage = load()

    expect(storage.isStorageConfigured()).toBe(false)
    const reported = errors.join('\n')
    expect(reported).toContain('BLOB_READ_WRITE_TOKEN')
    expect(reported).toContain('read-only')
    // Points at the fix, not just the symptom.
    expect(reported).toContain('DEPLOY.md')
  })

  it('says nothing when local disk is a legitimate choice', () => {
    // Off Vercel, no Blob token is the ordinary development setup.
    const storage = load()
    expect(storage.isStorageConfigured()).toBe(true)
    expect(errors.join('\n')).not.toContain('BLOB_READ_WRITE_TOKEN')
  })

  it('is satisfied by a Blob token on Vercel', () => {
    process.env.VERCEL = '1'
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test'
    const storage = load()
    expect(storage.isStorageConfigured()).toBe(true)
    expect(errors.join('\n')).not.toContain('BLOB_READ_WRITE_TOKEN is not set')
  })
})
