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
   config setting): `node scripts/vercel-build.js`. On a **production**
   build that runs `prisma migrate deploy` (retrying a lock timeout twice)
   and then `next build`; on a **preview** build it skips the migrations.
   See the note under step 4 for why.

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
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Optional — the bot check on sign-up, log-in and password reset. Free, from [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile. **Set both or neither** (see step 6.9). The site key is read at build time, so changing it needs a redeploy, not just a variable change. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PERSONAL_MONTHLY`, `STRIPE_PRICE_PERSONAL_ANNUAL`, `STRIPE_PRICE_PERSONAL_LIFETIME` | Optional — the Personal plan (RL-017, RL-042). Without `STRIPE_SECRET_KEY`, `/dashboard/upgrade` checkout requests fail with a 500; the rest of the app works fine without it. See step 6.5 below. |

`BLOB_READ_WRITE_TOKEN` is already set from step 2.

**Preview deployments and the database.** Vercel ticks Production *and*
Preview when you add a variable, so by default a preview build of any
branch gets the production `DATABASE_URL`/`DIRECT_URL`. The build used to
run `prisma migrate deploy` everywhere, which meant an unmerged PR's
migrations were applied to the live database, and a merge racing a push
failed with `P1002 … Timed out trying to acquire a postgres advisory
lock`. `scripts/vercel-build.js` now migrates on production only. Two
things are still worth doing:

- **Give previews their own database.** A preview on the production URLs
  still *reads and writes* production data. Neon's Vercel integration
  can create a database branch per preview; once it does, add
  `RUN_MIGRATIONS=1` to the **Preview** environment only so each preview
  migrates its own branch.
- **If a production deploy fails with P1002**, it was waiting on another
  migration that held the lock. Nothing was applied by the failed build;
  **Redeploy** it once the other build has finished.

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

## 6.5 Configure Stripe (optional — the Personal plan)

1. In the Stripe dashboard (live mode, or test mode while trying this out),
   create a **Personal** product with three Prices, currency `RON`, at the
   figures in `LADDER.PERSONAL` (`src/lib/plans.ts`): Monthly (9.90,
   recurring), Annual (99, recurring), Lifetime (299, one-time). Copy each
   Price ID into `STRIPE_PRICE_PERSONAL_MONTHLY` /
   `STRIPE_PRICE_PERSONAL_ANNUAL` / `STRIPE_PRICE_PERSONAL_LIFETIME`.

   **Upgrading from the Pro plans (RL-042, #54).** The old
   `STRIPE_PRICE_MONTHLY` / `_ANNUAL` / `_LIFETIME` variables are no longer
   read and can be removed. **Do not archive or delete those Prices in
   Stripe**: the subscriptions already on them keep renewing at their
   original price, and the webhook still settles them. Nothing needs
   migrating in Stripe — the database migration marks every account that
   held Pro as grandfathered (Personal, no vehicle cap). Whether Managed
   Payments applies to the Personal Prices is the same decision as before:
   set a tax code on the product if it is on.

   **Company plans (RL-042 slice 3, optional).** Organisations buy Pro,
   Business or Fleet. Create one product per rung — Pro, Business, and a
   Fleet product per step (100, 250, 500 vehicles) — each with a monthly
   and an annual **recurring** RON Price at the figures in `ORG_PLANS`
   (`src/lib/plans.ts`; annual is ten months), and set the ten
   `STRIPE_PRICE_ORG_*` variables. **Until all ten are set, organisations
   stay the closed beta** (`/admin/diagnostics` → *Company plan prices*
   says which are missing); once they are, anyone can create one, and a
   new organisation holds vehicles only after it buys a plan. Every
   organisation that existed before this was comped by the migration: free,
   no vehicle cap, nothing to do. For plan changes (a bigger Fleet step,
   monthly ↔ annual) to work from the portal, add the company products under
   Settings → Billing → Customer portal → *Products*, and add the
   `customer.subscription.updated` event to the webhook endpoint below.
2. Copy your Secret key into `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint:
   `https://<your-domain>/api/webhooks/stripe`, events
   `checkout.session.completed`, `invoice.payment_failed`,
   `invoice.payment_succeeded`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the
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

## 6.9 Cloudflare protection

Two separate things share the name, and only one of them lives in this
repository.

### Turnstile — the bot check on the forms (in the app)

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` switch on a
Cloudflare Turnstile widget on `/register`, `/login` and
`/forgot-password`. It is free at any volume, usually invisible (nobody
solves a puzzle), and Cloudflare states it neither sets tracking cookies
nor profiles visitors — which matters here, because `/cookies` claims
every cookie this site sets is strictly necessary.

1. dash.cloudflare.com → **Turnstile** → *Add widget*.
2. Add every hostname the app is served from — your custom domain **and**
   the `*.vercel.app` one if you use it. A hostname that is not listed
   gets its tokens rejected, which on the login form looks exactly like
   everyone suddenly having the wrong password.
3. Widget mode **Managed** is the right default.
4. Copy the site key and the secret key into the two variables, then
   **redeploy** — the site key is baked into the browser bundle at build
   time.

**Set both or neither.** A site key with no secret renders a widget whose
answers nothing checks, which is the worst state to be in: the forms look
protected and are not. A secret with no site key means no form can
produce a token. The app treats either half-configured state as *off*
rather than half-on, and `/admin/diagnostics` reports it as a failure so
it is not something you find out from a support email.

If Cloudflare cannot be reached, the request is **allowed through** and
the rate limits carry it. That is deliberate: failing closed would turn
somebody else's outage into registration, login and password reset being
down for everyone. A rejection Cloudflare actually issues is never waved
through — only the absence of an answer is.

There is one limit worth knowing before you switch it on. The fail-open
above covers Cloudflare's *verification* endpoint being unreachable from
the server. It does not cover a visitor whose browser cannot load the
widget at all — an ad blocker, a corporate network filter, a
country-level block, or Turnstile being down outright. Those produce no
token, and a request with no token is refused, because a request cannot
prove why it has none and accepting one that merely claims it was blocked
would accept whatever a script claimed. Such a visitor cannot sign in
while this is on. The form tells them which of the two it looks like and
what to try; clearing both keys is your lever if it turns out to affect
real people.

Without these keys the forms still work and are still rate limited. The
limits bound how fast one address or one account can be hit; they do
nothing about a hundred residential proxies making three requests each,
which is what Turnstile is for.

### The proxy in front of the site (not in this repo)

The bigger half of "Cloudflare protection" is DNS and dashboard
configuration that no code here can perform, and it is worth doing if you
own the domain:

1. Add the domain as a **site** in Cloudflare and move its nameservers
   there.
2. Point the record at Vercel and set it to **Proxied** (the orange
   cloud). Vercel's own docs cover the CNAME/A values; keep SSL/TLS mode
   on **Full (strict)**.
3. Turn on **Bot Fight Mode**, and **Rate limiting rules** if your plan
   has them, for `/api/auth/*`.

This gets you DDoS absorption and WAF filtering *before* a request ever
reaches a Vercel function, which is the only layer that can protect the
free tier's invocation budget — nothing inside the app can, because by
then the invocation has already happened.

One thing to check afterwards: the app reads the client IP from
`x-forwarded-for` (`src/lib/rateLimit.ts`), which is what the IP-keyed
rate limits are keyed on. Cloudflare in front of Vercel keeps that chain
correct, but if you ever put a different proxy in the path, confirm it
**overwrites** rather than appends to that header — otherwise a client can
supply its own value and rotate it per request to walk around the limits.

## 6.10 Email confirmation for password signups

Nothing to configure: it is on whenever a mail provider and
`NEXTAUTH_URL` are both set, which step 4 already covers.

An account created with an email and password is emailed a link and
cannot **publish a build, invite a collaborator, or post on the feedback
and parts boards** until it is opened. Its own garage — vehicles, tasks,
photos, documents, costs — works normally throughout, because none of
that reaches anybody else. Google signups skip the step entirely: Google
has already verified the address, and this app refuses one Google reports
as unverified.

**With no mail provider configured the rule switches itself off**, rather
than walling every new account behind a link that cannot be sent. That is
the right failure but an invisible one — the sign-up flow looks completely
normal — so `/admin/diagnostics` reports it under *Sign-up and abuse*.
Check there if you expected confirmation to be running.

Accounts that already existed when this shipped were grandfathered in by
the migration: they were never asked, and locking people out under a rule
that did not exist when they joined would be the worse wrong.

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

### The diagnostics page says you are in test mode

It is reading `STRIPE_SECRET_KEY`. If that starts with `sk_test_`, the
deployment is in test mode — checkout opens, Stripe's test cards work, and
a real card is declined. Nothing in the app can switch it.

To go live:

1. Turn off the test-mode toggle in the Stripe dashboard, then copy
   Developers → API keys → **Secret key** (`sk_live_…`). It only exists
   once the account is activated.
2. Replace the three `STRIPE_PRICE_PERSONAL_*` ids at the same time. **A Price
   created in test mode does not exist in live mode** — same-looking id,
   different object space — so leaving them alone breaks Pro checkout with
   "No such price" the moment the key changes. `/admin/diagnostics` checks
   each one against the live key and names any that are missing.
3. Add the webhook endpoint again **in live mode** (Developers → Webhooks
   → your `/api/webhooks/stripe` URL) and copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`. Endpoints and their secrets are per-mode too,
   and this is the expensive one to get wrong: a test-mode secret under a
   live key passes every "is it set?" check and then rejects every event
   as an invalid signature — **the card is charged, the donation stays
   PENDING, and Pro is never granted.** `/admin/diagnostics` lists the
   endpoints in the current mode and says whether one points here.
4. Set all five on the **Production** environment and **redeploy**.
   Changing a variable does not affect the deployment already running,
   which is the usual reason the page still says test mode after the key
   was swapped.

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

- `STRIPE_PRICE_PERSONAL_MONTHLY holds a product id (prod_…)` — the Price id lives
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
