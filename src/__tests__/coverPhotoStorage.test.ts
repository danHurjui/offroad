import fs from 'fs'
import path from 'path'

/**
 * Pitfall #14: deleting or replacing a row does not delete its file.
 *
 * The cover route could get away with ignoring that while a cover could
 * only be set once, at vehicle creation. Now that the edit screen can
 * replace and remove one, every change would otherwise strand an image in
 * Blob for good — and an account erasure would not reach it either, since
 * the key is gone from the row by then.
 */
describe('the cover photo route', () => {
  const SOURCE = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'api', 'vehicles', '[id]', 'cover-photo', 'route.ts'),
    'utf8'
  )

  it('deletes the image it replaces', () => {
    expect(SOURCE).toMatch(/deleteUpload\(previousCover\)/)
  })

  it('offers a DELETE, so removing a cover removes the bytes too', () => {
    // A PATCH with `coverPhotoUrl: null` would null the column and leave
    // the file, which is why removal does not go that way.
    expect(SOURCE).toMatch(/export async function DELETE/)
  })

  it('reads the old key before the row is updated', () => {
    // Afterwards there is nothing left to read it from — the same ordering
    // the account-erasure handlers use.
    const capture = SOURCE.indexOf('const previousCover = vehicle.coverPhotoUrl')
    const update = SOURCE.indexOf('prisma.vehicle.update')
    expect(capture).toBeGreaterThan(-1)
    expect(capture).toBeLessThan(update)
  })

  it('is owner-only, like every other write under a vehicle', () => {
    expect(SOURCE).toMatch(/requireVehicleOwner/)
    expect(SOURCE).not.toMatch(/requireVehicleAccess/)
  })
})
