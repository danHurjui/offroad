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

## 7. Create the first admin account

The admin area (`/admin`) moderates the public feedback board. Nothing in
the app can grant it: `User.isAdmin` is settable only in the database, and
`PATCH /api/admin/users/[userId]` copies exactly `active` and
`isProComped` onto the row, so not even a signed-in admin can mint another
one. That is why the first one is made from outside:

```bash
# From a checkout of this repo, with the production connection strings.
# Both are needed — prisma/schema.prisma reads DIRECT_URL as well.
DATABASE_URL="<the pooled Neon URL from Vercel>" \
DIRECT_URL="<the direct Neon URL from Vercel>" \
  npm run db:create-admin -- you@example.com "Your Name"
```

Copy both strings from the Vercel project's environment variables — the
same two values section 4 set. The script prints the host and database it
is about to write to before it changes anything, and asks for confirmation
(`--yes` skips the prompt for a non-interactive run).

- **The account already exists?** It is promoted in place, and reactivated
  if it had been deactivated — an admin who cannot log in is not an admin.
  Its password is left alone unless you pass `--reset-password`.
- **It does not exist?** It is created, with a password you supply in
  `ADMIN_PASSWORD` or one generated and printed once. Change it after
  signing in.
- Re-running it changes nothing, so it is safe in a deploy script.
- An account created this way does **not** take a founding-member slot;
  those hundred are for real signups.

Confirm it worked by signing in and opening `/admin`. A non-admin gets a
404 there rather than a 403 — the admin area doesn't confirm its own
existence to someone guessing URLs — so a 404 after doing this means the
flag didn't land, not that the URL is wrong.

## 8. Submit the sitemap to Google Search Console

The app serves `/sitemap.xml` and `/robots.txt` itself; both are generated
per request, so a newly published build appears without a redeploy.

**Set `NEXTAUTH_URL` first.** Both files fall back to
`http://localhost:3000` when no public origin resolves, and Search Console
rejects a sitemap of localhost URLs outright — the error names the URLs,
not the cause. The runtime log says so explicitly on the first request:

```
[appUrl] No public origin resolved, so sitemap.xml and robots.txt are being written with
http://localhost:3000. Google Search Console rejects a sitemap of localhost URLs. …
```

Check `https://<your-domain>/sitemap.xml` in a browser before submitting;
every `<loc>` should be on your own domain.

Then, in [Search Console](https://search.google.com/search-console):

1. Add the property for your domain and verify it. The DNS TXT method
   works with any registrar; the HTML-file method does not, since this app
   serves no arbitrary static files from the domain root.
2. **Sitemaps → Add a new sitemap → `sitemap.xml`.**
3. Give it a few days. "Discovered – currently not indexed" on a new site
   is normal and not an error.

What it contains: the marketing homepage, the community feed, the parts
board, the roadmap, the donate and legal pages, every published build, and
every ticket and parts request. Everything else needs a session and is
disallowed in `robots.txt` — the two files are written as a pair, and a
test asserts the sitemap never lists a URL robots.txt disallows (which
Search Console would otherwise report as "Blocked by robots.txt", once per
URL).

**One caveat worth knowing.** The interface is bilingual but the language
comes from a cookie rather than the URL, so each page has exactly one
address and there is no `hreflang` to declare. Google indexes each page in
the default language. If you want the Romanian and English versions of a
build page ranking separately, that needs URL-prefixed routing
(`/en/builds/…`), which is a different change — see the note in
`src/i18n/config.ts`.

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

## Troubleshooting: check the diagnostics page first

Sign in as an admin and open **`/admin/diagnostics`**. It reports, in one
place, whether payments, storage, email, push and the public address are
configured — naming the variable at fault and what to change. For Stripe
it goes one further and asks Stripe about the account the key belongs to,
which is the only way to catch a key that is well-formed but revoked, or
an account that has not finished activation and so cannot take live
charges.

Everything below is the same information, found by hand. Use it when you
have no admin account yet, or when the page says the failure came from
Stripe rather than from configuration.

## Troubleshooting: Stripe is configured but nothing happens

The symptom tells you which half is wrong. They fail in different places
and have nothing to do with each other.

### Checkout fails with "the product tax code is missing"

Stripe's **Managed Payments** — Stripe acting as merchant of record — is
enabled by default on accounts created since it shipped, and it refuses
any line item whose product has no tax code.

Donations are already handled: their session opts out of Managed
Payments, because a contribution is not a sale and has no honest tax code
to give it. Nothing to do there.

The Pro plans are not opted out, because that is a real sale and the
choice is yours. If Pro checkout fails this way, either set a tax code on
each product (Stripe dashboard → Product catalogue → the product → Tax
code), or turn Managed Payments off by default under Settings → Managed
payments.

### Checkout or a donation says payments are not set up

That wording (HTTP 503) means the app refused before contacting Stripe,
because its own configuration is wrong — retrying will never help. The
cause is on `/admin/diagnostics`, and in the runtime log on a line
beginning `[billing]` or `[donation]`. Look for one of:

- `STRIPE_PRICE_MONTHLY holds a product id (prod_…)` — the Price id lives
  *under* the product in the catalogue, and starts with `price_`. Pasting
  the product id, or the payment-link URL from the same page, is the usual
  slip.
- `STRIPE_SECRET_KEY holds a publishable key (pk_…)` — the two sit beside
  each other on the API keys page. The secret one starts with `sk_`.
- `No such price: price_…` **with a real price id** — test and live are
  separate object spaces. A live price under a test key, or the reverse,
  fails even though both values were copied correctly. Check that the key
  and all three prices come from the same mode; the toggle is in the
  dashboard's top bar.
- Prices in the wrong currency still work, but the buyer is charged in
  that currency. The app's copy says RON because `PRO_PLANS` says RON.

Remember a deploy has to happen *after* the variables exist — the running
deployment captured the old environment.

### Payment goes through but the account is still on the free tier

Checkout worked; the webhook did not. `User.isPro` is written in exactly
one place (`/api/webhooks/stripe`) and reaching the success page proves
nothing, by design — so this is always the webhook.

Look at Developers → Webhooks → your endpoint → the event list. Stripe
shows every delivery and its response:

- **No events at all** — the endpoint is not registered, or is registered
  in the other mode. A test-mode payment only notifies a test-mode
  endpoint.
- **400 `webhookNotConfigured`** — `STRIPE_WEBHOOK_SECRET` is unset in the
  deployment.
- **400 `invalidSignature`** — the secret belongs to a different endpoint.
  Each endpoint has its own; copy the one shown on *this* endpoint's page.
  The runtime log carries the verification error too.
- **200, but still no Pro** — check the event type is among the four
  section 6.5 lists. `checkout.session.completed` is the one that grants
  it.

You can replay a delivery from that same page once the secret is fixed,
rather than making another payment.

## Troubleshooting: every upload fails with a 500

Uploading a cover photo, a document scan, a receipt or a task photo
returns a 500 and the app says it could not save the file.

**Check the runtime logs first** — since the storage layer reports its own
failures, the cause is named there:

```
[storage] save failed on local disk (UPLOADS_DIR=./public/uploads) for "…": EROFS: read-only file system
[storage] BLOB_READ_WRITE_TOKEN is not set while running on Vercel, so uploads are being written
to the serverless filesystem, which is read-only. …
```

That pair is the usual cause and section 2 is the fix: create a Blob store
and link it to the project. Linking it sets `BLOB_READ_WRITE_TOKEN`
automatically, and `src/lib/storage.ts` switches every read and write to
Blob with no code change — but **a deploy has to happen after the variable
exists**, because the running deployment captured the old environment.

Two things this is *not*:

- **Not the 4MB limit.** That answers 400 with "File too large", not 500.
- **Not a permissions problem.** A file the user may not touch answers 404.

If the log instead names a Blob error (a 401, or a store that no longer
exists), the token is stale: re-link the store and redeploy.

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
