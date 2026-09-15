# Deploying RigLog to Vercel (free)

Everything below fits in the free tier of every service involved: Vercel
Hobby, a free Postgres (Neon), and Vercel Blob's free storage allowance.
Local development (`./start.sh`) is unaffected by any of this — it keeps
using the docker-compose Postgres and local disk storage.

## Why this needed changes from local dev

Vercel runs the app as serverless functions with no shared, persistent
filesystem — two requests can land on different machines, and disk writes
don't survive between invocations. Two things in this repo specifically
depend on a persistent disk if you don't do this setup:

1. **Photo/document storage** — `src/lib/storage.ts` writes to local disk
   by default. Setting `BLOB_READ_WRITE_TOKEN` switches it to Vercel Blob
   automatically, with no other code changes.
2. **Postgres connections** — a serverless function opens a fresh DB
   connection per invocation, which exhausts a small Postgres's connection
   limit fast. A pooled connection string (Neon's PgBouncer endpoint, or
   Vercel Postgres) fixes this — see `DATABASE_URL` / `DIRECT_URL` below.

## 1. Create a free Postgres database (Neon)

1. Sign up at [neon.tech](https://neon.tech) (or use Vercel's own
   "Storage → Postgres" tab in a project, which is Neon-backed and skips
   step 2 below since Vercel injects the env vars for you).
2. Create a project, then copy two connection strings from the Neon
   dashboard:
   - **Pooled connection** (hostname contains `-pooler`) → `DATABASE_URL`
   - **Direct connection** → `DIRECT_URL`

   Prisma uses `DATABASE_URL` for every query at runtime and `DIRECT_URL`
   for migrations (`prisma migrate deploy`, run automatically on every
   deploy — see step 4). Both are required; see `prisma/schema.prisma`
   for why.

## 2. Create a free Vercel Blob store

In the Vercel dashboard: **Storage → Create Database → Blob**, then
connect it to this project. Vercel injects `BLOB_READ_WRITE_TOKEN`
automatically — you don't need to copy it anywhere yourself.

## 3. Import the project into Vercel

1. [vercel.com/new](https://vercel.com/new) → import this GitHub repo.
2. Framework preset auto-detects as Next.js. Leave build settings as-is —
   Vercel automatically runs the `vercel-build` script from `package.json`
   instead of `build` (this is a standard Vercel convention, not a Vercel
   config setting): `prisma migrate deploy && next build`, which applies
   the schema to your fresh Neon DB on every deploy.

## 4. Set environment variables

Project Settings → Environment Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (step 1) |
| `DIRECT_URL` | Neon direct connection string (step 1) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://<your-project>.vercel.app` (or custom domain) — see note below |
| `CRON_SECRET` | Another random string (`openssl rand -base64 32`) |
| `RESEND_API_KEY` | Optional — from [resend.com](https://resend.com) (free tier). Without it, password-reset and document-reminder emails just log to the function's console instead of sending, which is invisible to real users. |
| `EMAIL_FROM` | Optional, e.g. `RigLog <no-reply@yourdomain.com>` (needs a domain verified in Resend) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — Google OAuth login |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_LIFETIME` | Optional — Pro upgrade (RL-017). Without `STRIPE_SECRET_KEY`, `/dashboard/upgrade` checkout requests fail with a 500; the rest of the app works fine without it. See step 6.5 below. |

`BLOB_READ_WRITE_TOKEN` is already set from step 2.

**`NEXTAUTH_URL` note:** you won't know your `*.vercel.app` domain until
after the first deploy. Deploy once, copy the assigned domain, set
`NEXTAUTH_URL` to it, then redeploy (env var changes need a redeploy to
take effect). This isn't just a NextAuth internal detail — the password
reset and document reminder emails build their links from
`process.env.NEXTAUTH_URL` directly.

## 5. Deploy

Push to the branch Vercel is tracking, or click Deploy. First deploy runs
`prisma migrate deploy` against your Neon DB (via `DIRECT_URL`), then
builds. Watch the build log — a failure here almost always means
`DATABASE_URL`/`DIRECT_URL` are missing or unreachable.

Optional: seed demo data by running `npm run db:seed` **locally** with
your production `DATABASE_URL`/`DIRECT_URL` exported in your shell first —
there's no seed step wired into the deploy itself, and you generally don't
want one (it would try to reseed the demo account on every deploy).

## 6. Confirm the cron job

`vercel.json` schedules a daily hit (08:00 UTC) against
`/api/cron/document-reminders` — Vercel Cron picks this up automatically
on deploy; check **Settings → Cron Jobs** to confirm it's listed. Vercel
sends an `Authorization: Bearer $CRON_SECRET` header automatically since
`CRON_SECRET` is set as a project env var (see the route's comment in
`src/app/api/cron/document-reminders/route.ts`). Hobby plan cron jobs are
limited to once a day, which this already respects.

## 6.5 Configure Stripe (optional — Pro upgrade)

1. In the Stripe dashboard (live mode, or test mode while trying this out),
   create three Prices with currency `RON`: Monthly (14.99, recurring),
   Annual (99, recurring), Lifetime (299, one-time). Copy each Price ID
   into `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` /
   `STRIPE_PRICE_LIFETIME`.
2. Copy your Secret key into `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint:
   `https://<your-domain>/api/webhooks/stripe`, events
   `checkout.session.completed`, `invoice.payment_failed`,
   `invoice.payment_succeeded`, `customer.subscription.deleted`. Copy the
   endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Redeploy so the new env vars take effect.

Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
prints a webhook secret for `STRIPE_WEBHOOK_SECRET` without registering a
public endpoint.

## Known free-tier constraints

- **Uploads are capped at 4MB** (`MAX_UPLOAD_BYTES` in `src/lib/storage.ts`)
  — Vercel serverless functions have a ~4.5MB request body limit on every
  plan. Photos are compressed client-side to ~1200px before upload
  (`src/lib/compressImage.ts`), so this rarely matters for photos; a large
  scanned PDF receipt could still hit it. Raising this ceiling needs a
  direct-client-to-Blob upload flow (`@vercel/blob/client`'s `upload()`
  with a signed token), which this repo doesn't implement — the current
  flow always proxies through our own API route so vehicle-access checks
  apply before any file is written or read (see CLAUDE.md).
- **Neon free tier**: 0.5GB storage, and the compute auto-suspends after
  inactivity (a cold first request after idle can take a couple of
  seconds — normal, not a bug).
- **Vercel Blob free allowance**: check the current number on Vercel's
  pricing page; it's a Hobby-plan-included amount, not unlimited.
- **Resend free tier**: 3,000 emails/month, 100/day, and requires a
  verified sending domain for `EMAIL_FROM` (their default onboarding
  domain works for testing but not for real users).
