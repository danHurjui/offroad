import fs from 'fs'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shouldMigrate } = require('../../scripts/vercel-build.js') as { shouldMigrate: (env: Record<string, string | undefined>) => boolean }

/**
 * A preview build migrating the production database is how an unmerged
 * PR changes the live schema, and how a merge and a push raced for the
 * migration lock (P1002). Only production migrates.
 */
describe('vercel-build', () => {
  it('migrates on production builds', () => {
    expect(shouldMigrate({ VERCEL_ENV: 'production' })).toBe(true)
  })

  it('never migrates a preview or development build by default', () => {
    expect(shouldMigrate({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(shouldMigrate({ VERCEL_ENV: 'development' })).toBe(false)
    expect(shouldMigrate({})).toBe(false)
  })

  it('lets a preview with its own database opt in', () => {
    expect(shouldMigrate({ VERCEL_ENV: 'preview', RUN_MIGRATIONS: '1' })).toBe(true)
  })

  it('is what package.json tells Vercel to run', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.scripts['vercel-build']).toBe('node scripts/vercel-build.js')
  })
})
