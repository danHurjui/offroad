/**
 * What Vercel runs instead of `npm run build` (package.json → vercel-build).
 *
 * ## Only production migrates
 *
 * This used to be `prisma migrate deploy && next build` on **every**
 * build. Vercel gives Preview deployments the same environment variables
 * as Production unless told otherwise, so every preview build ran its
 * branch's migrations against the production database — an unmerged PR
 * could change the live schema. It also meant a merge (production build)
 * and a push to the next branch (preview build) raced for Prisma's
 * migration advisory lock, and the loser failed after 10 s with P1002
 * "Timed out trying to acquire a postgres advisory lock".
 *
 * Now only `VERCEL_ENV=production` migrates. A preview whose code needs a
 * new column will error on the pages that read it until merged — the
 * honest failure, and the one that cannot damage anything. To give
 * previews a database of their own (Neon's Vercel integration creates a
 * branch per preview), set `RUN_MIGRATIONS=1` on the Preview environment
 * only, with that branch's URLs.
 *
 * ## A lock timeout is retried
 *
 * `migrate deploy` is idempotent, so a failed attempt is retried twice
 * with a pause — enough to outlast another deploy still holding the lock,
 * or a Neon compute waking from suspend. A real migration error fails all
 * three attempts and the build stops, as it should: `next build` never
 * runs against a schema the code does not match.
 */

const { spawnSync } = require('node:child_process')

const ATTEMPTS = 3
const PAUSE_SECONDS = [0, 20, 40]

/** Whether this build should apply migrations. Pure, for the test. */
function shouldMigrate(env) {
  return env.VERCEL_ENV === 'production' || env.RUN_MIGRATIONS === '1'
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
  return result.status ?? 1
}

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000)
}

function main() {
  if (shouldMigrate(process.env)) {
    let ok = false
    for (let attempt = 1; attempt <= ATTEMPTS && !ok; attempt++) {
      if (PAUSE_SECONDS[attempt - 1] > 0) {
        console.log(`[vercel-build] migrate deploy failed; retrying in ${PAUSE_SECONDS[attempt - 1]}s (attempt ${attempt}/${ATTEMPTS})`)
        sleep(PAUSE_SECONDS[attempt - 1])
      }
      ok = run('npx', ['prisma', 'migrate', 'deploy']) === 0
    }
    if (!ok) {
      console.error('[vercel-build] migrate deploy failed after retries; not building against a mismatched schema')
      process.exit(1)
    }
  } else {
    console.log(
      `[vercel-build] skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}); only production migrates — see scripts/vercel-build.js`
    )
  }
  // RL-048: the receipt reader's files, in case node_modules came from
  // Vercel's build cache without postinstall having run against it.
  if (run('node', ['scripts/copy-ocr-assets.js']) !== 0) process.exit(1)
  process.exit(run('npx', ['next', 'build']))
}

if (require.main === module) main()

module.exports = { shouldMigrate }
