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
| `BREVO_API_KEY` | **Required for password reset to work at all** (or `RESEND_API_KEY` instead) — from [brevo.com](https://brevo.com), free tier. Brevo lets you verify a single sender address, so it works without owning a domain. Without any provider key, `/forgot-password` refuses with a 503 rather than silently pretending to send; document-reminder and follow emails are dropped with an error in the function log. |
| `RESEND_API_KEY` | Alternative to Brevo — requires a verified *domain*. If both keys are set, **Brevo is used**. |
| `EMAIL_FROM` | e.g. `RigLog <no-reply@yourdomain.com>`. Must be a sender you have **verified with whichever provider you use** — on Brevo that can be a single address (a Gmail, say); on Resend it must be a domain. The default is `no-reply@riglog.ro`, which will fail unless you own and have verified that domain. |
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

## 6.6 Configure Web Push (optional — RL-023 follow notifications)

1. Run `npx web-push generate-vapid-keys` (no install needed, `npx` fetches
   it on the fly).
2. Set `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the printed
   public key (both, identical value — see the comment in `.env.example`
   for why), and `VAPID_PRIVATE_KEY` to the private key.
3. Redeploy. Without these set, the "Enable push on this device" button in
   Settings reports "not configured" and email notifications to followers
   keep working on their own.

## 6.8 Configure Google sign-in (optional)

Both halves must be set or the provider is not registered at all —
`isGoogleAuthConfigured()` in `src/lib/auth.ts` checks for both, and the
"Continue with Google" button asks NextAuth which providers exist rather
than reading an env var, so a half-configured deploy hides the button
instead of sending people to a Google error page.

1. Google Cloud Console -> APIs & Services -> Credentials -> **Create
   credentials -> OAuth client ID -> Web application**.
2. **Authorized redirect URI** — this is the field people get wrong. It
   must be exactly:

   ```
   https://<your-domain>/api/auth/callback/google
   ```

   Not the site root, not `/login`. It has to match character for
   character, including `https` and no trailing slash. Add a second entry
   for `http://localhost:3000/api/auth/callback/google` if you want it
   working locally.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.

`NEXTAUTH_URL` has to be right for this too — NextAuth builds the redirect
it sends to Google from the same origin, so a wrong value there produces a
`redirect_uri_mismatch` from Google even when the console entry is
correct. See `src/lib/appUrl.ts`.

A Google account signing in for the first time creates a RigLog account
found-or-created by email, and takes a founding-member slot if one is
free, exactly like a password signup. An address Google itself reports as
unverified is refused, because this flow matches on email and would
otherwise be an account-takeover route.

## 6.7 Set the privacy contact (do this before taking real users)

`/privacy` and `/cookies` are live and readable without a session. Two
values on them are not hardcoded, because whoever deploys this is the
data controller — not the author of the code — and printing a contact
address nobody monitors would be worse than printing none:

- `NEXT_PUBLIC_PRIVACY_CONTROLLER` — the name that appears as the entity
  responsible for the data.
- `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` — where data requests go.

With neither set the page still renders and still says something true: it
points readers at the feedback board. The two rights people are most
likely to want — download everything, delete everything — are buttons in
Profile & settings and work whether or not these are configured.

Everything else on those pages is generated from `src/lib/legal.ts`,
which is written from what the code actually does. **If you add a service
that receives user data, add it to `SUB_PROCESSORS` in the same change** —
there is a test asserting that every external host the code calls appears
in that list.

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

## Troubleshooting: password reset emails aren't arriving

The reset flow itself (token → link → new password) is covered by tests;
in practice a missing email is almost always one of these three, in order
of likelihood:

1. **No provider key is set.** `/forgot-password` answers `503` with
   `code: "EMAIL_NOT_CONFIGURED"` and logs
   `[email] no email provider configured` in the function log. Set
   `BREVO_API_KEY` (or `RESEND_API_KEY`) and **redeploy** — env changes
   don't apply to a running deployment.

2. **`EMAIL_FROM` isn't a sender you've verified.** The provider rejects
   the send; the route answers `502` with `code: "EMAIL_SEND_FAILED"` and
   the function log carries the provider's own reason plus the `from`
   address it tried. On **Brevo**, `EMAIL_FROM` must match a verified
   sender exactly (Senders, Domains & Dedicated IPs → Senders), or sit on
   a verified domain. On **Resend**, the domain must be verified.

3. **You've hit the per-address limit** while testing — 3 requests per
   hour for the same email. The response is a `429` with `Retry-After`,
   and the page now says so instead of claiming a link was sent.

Brevo's free tier is a daily send allowance rather than a domain
requirement, so a verified single sender is enough to email real users.
Check the current daily limit on their pricing page — a reset storm or a
document-reminder cron run counts against it.
