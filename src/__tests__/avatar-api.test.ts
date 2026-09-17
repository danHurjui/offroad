import fs from 'fs'
import path from 'path'

/**
 * `User.avatarUrl` is a storage key, and /api/avatars/[userId] streams
 * whatever it holds with no access check of its own — a profile picture
 * has to load for a logged-out reader on a public build page.
 *
 * That is only safe while the client can never choose the key. These pin
 * the two halves of that: one writer, and no path from the request.
 */
describe('the avatar routes', () => {
  const read = (...segments: string[]) =>
    fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'api', ...segments), 'utf8')

  const ME = read('me', 'route.ts')
  const UPLOAD = read('me', 'avatar', 'route.ts')
  const SERVE = read('avatars', '[userId]', 'route.ts')

  it('PATCH /api/me does not accept avatarUrl', () => {
    // It used to. Setting it to another user's receipt key and then
    // fetching your own avatar would have read their file.
    expect(ME).not.toMatch(/data\.avatarUrl\s*=/)
  })

  it('the upload route is the only writer', () => {
    expect(UPLOAD).toMatch(/data: \{ avatarUrl: storagePath \}/)
    expect(UPLOAD).toMatch(/requireSession/)
  })

  it('the serving route reads the key off the row, never from the request', () => {
    expect(SERVE).toMatch(/readUpload\(user\.avatarUrl\)/)
    // No params beyond the user id reach storage.
    expect(SERVE).not.toMatch(/params\.path/)
    expect(SERVE).not.toMatch(/readUpload\(params/)
  })

  it('deletes the image it replaces, and the one it removes', () => {
    // Pitfall #14 — the row stops pointing at the file, so nothing else
    // would ever reach it, including an account erasure.
    expect(UPLOAD).toMatch(/deleteUpload\(existing\.avatarUrl\)/)
    expect(UPLOAD).toMatch(/export async function DELETE/)
  })

  it('refuses a PDF, unlike the other upload routes', () => {
    // This one is rendered as an image and nothing else.
    expect(UPLOAD).toMatch(/ALLOWED_AVATAR_TYPES/)
    expect(UPLOAD).not.toMatch(/application\/pdf/)
  })

  it('still enforces the upload size cap', () => {
    expect(UPLOAD).toMatch(/MAX_UPLOAD_BYTES/)
    expect(UPLOAD).toMatch(/fileTooLarge/)
  })
})
