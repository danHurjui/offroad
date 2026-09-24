# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RigLog — off-road build tracker, classic car restoration journal, and
everyday repair log. A single Next.js 14 (App Router) PWA. One `Vehicle` is
in `OFFROAD`, `RESTORATION` or `DAILY_DRIVER` mode; the mode is a config flag
(`src/lib/projectType.ts`) that reconfigures category taxonomy, status tags,
and photo type labels — the data model and screens are identical for all
three.

Infrastructure and conventions are carried over from the kids-heaven-education
admin app: Next.js App Router + Prisma (direct, no ORM-agnostic layer) +
NextAuth v4 (JWT sessions) + Postgres via docker-compose (no Redis — it was
in the original kids-heaven env template but nothing here ever used it).
This diverges from the Supabase stack described in the product's original
analysis doc — see "Product docs" below.

Deploys to Vercel's free tier — see `DEPLOY.md`. That constrained two
things beyond the kids-heaven pattern: photo/document storage
(`src/lib/storage.ts`) is Vercel Blob in production, not just local disk,
and Postgres needs a pooled connection string (`DATABASE_URL` +
`DIRECT_URL` in `prisma/schema.prisma`) since serverless functions don't
share connections. Both sections below cover the details.

## Product docs

The product was specced in two documents (not checked into this repo —
ask the project owner for copies if you need the originals):
- **RigLog_Analysis_Specs_v4.docx** — market analysis, product vision,
  feature spec, monetization. Written against a Supabase stack; treat its
  tech sections (5.1–5.3) as superseded by this file.
- **RigLog_Feature_Tickets_v3.docx** — RL-001…RL-033 ticket backlog with
  acceptance criteria, phased 1–4. Phase 1 (RL-001–010, RL-029), Phase 2
  (RL-011–017, RL-030–033), Phase 3 (RL-018–024), and Phase 4 (RL-026,
  RL-027, RL-028) are implemented. RL-025 (native Expo app) was closed
  `not_planned` by the repo owner — see "What's not built yet" below.

## Commands

```bash
# Dev
./start.sh [dev|stop|logs]
docker-compose up -d          # postgres only

# Tests
npm test                                          # Jest, Prisma mocked
npm test -- --testPathPatterns=vehicles-api.test.ts   # single file

# Build / typecheck / lint
npm run build
npx tsc --noEmit
npm run lint

# Database
npm run db:migrate      # prisma migrate dev
npm run db:generate     # regenerate client after schema change
npm run db:seed         # dev seed data
npm run db:create-admin -- you@example.com "Your Name"   # create/promote an admin
npm run db:studio
```

### Dev seed credentials (created by `npm run db:seed`)
| Email | Password | Notes |
|---|---|---|
| demo@riglog.ro | demo1234 | Owner with one off-road vehicle and one restoration project |

## Architecture

### Auth — NextAuth v4, JWT sessions
Email/password (bcrypt) + optional Google OAuth, mirroring
`kids-heaven-education/admin/src/lib/auth.ts`: OAuth users are found-or-created
by email and linked via `OAuthAccount` (provider + providerAccountId), not
NextAuth's full Prisma adapter. Session strategy is `jwt`; `token.id` carries
the internal user id. See `src/lib/auth.ts`.

**Google is registered only when both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set** (`isGoogleAuthConfigured()`). A provider
registered with an empty client id still renders a button that leads to a
Google error page, which reads as a broken app rather than a missing
setting. `GoogleSignInButton` asks `getProviders()` rather than reading an
env var — the pages are client components, and a button kept in sync by
hand eventually isn't.

**The `signIn` callback matches on email, so two things are load-bearing.**
It refuses an address Google itself reports `email_verified: false` for —
without that, anyone able to assert an address could take over the account
that already owns it. And it lowercases before matching, or a mixed-case
Google address creates a duplicate account alongside the password one.

**Both signup paths go through `createUserWithFoundingGrant()`**, so a
Google signup can be a founding member too. That helper exists because the
grant originally lived only in the credentials route, which quietly made
the promotion "the first hundred passwords" rather than "the first hundred
accounts"; a test asserts neither path calls `prisma.user.create` directly.

### Confirming an email address (`src/lib/emailVerification.ts`)
A password signup gets `emailVerifiedAt = null` and an emailed link. A
**Google signup is verified at creation** and never sees one: the `signIn`
callback above already refuses an address Google reports as
`email_verified: false`, so the claim has been checked by the party that
owns the mailbox. Mailing a link to prove it again would be a worse
version of something already done.

**Never read `emailVerifiedAt` directly.** Three questions live in that
module and they are not the same question:
- `isEmailVerified()` is the fact, and it never softens — the settings
  page reports it, and a card saying "confirmed" because the operator
  forgot a mail key would be a false statement about somebody's account.
- `isVerificationEnforced()` is whether the rule can fairly be applied.
- `isBlockedAsUnverified()` is the two together, and is what gates read.

**It fails open, and that is load-bearing.** Enforcing needs a mail
provider *and* a resolvable `NEXTAUTH_URL` — the link has to be sent and
it has to point somewhere. Missing either switches the rule off rather
than walling every new account behind a message that can never arrive.
Same call the rate limiter makes about an unreachable database: a
misconfiguration should degrade a defence, not brick the product.
`/admin/diagnostics` reports the degraded state, because the signup flow
looks completely normal with it off.

**What it gates is the writes that reach other people**, not the garage:
publishing a build, inviting a collaborator, and posting/commenting/voting
on the feedback and parts boards. Logging work on your own vehicle needs
no confirmed address — holding that hostage would punish somebody for a
link still in transit. `requireVerifiedSession()` (authz.ts) is the gate;
publishing is checked at the *field* instead, inside `PATCH
/api/vehicles/[id]`, because every other field on that route edits a
private record. `emailVerification.test.ts` asserts both lists against the
source, so a handler pasted from an old one cannot quietly drop the gate.

**The gate reads the database rather than the token.** `active` and
`isAdmin` ride on the JWT and are refreshed on an interval, which suits
flags that change rarely. Verification changes exactly once, and the
instant after it changes is precisely when the person retries the thing
they were blocked from — they clicked the link and came straight back. A
token-cached flag would refuse them for up to a minute while telling them
to do what they have just done.

Accounts predating this were **grandfathered by the migration** to their
own `createdAt`, not to `NOW()`. They were never asked, and locking people
out under a rule that did not exist when they joined is the worse wrong;
the timestamp at least does not claim the address was proved today.

Resends leave older tokens alive — somebody resends because the first has
not arrived, and whichever one they open has to work. Consuming any token
spends all of the account's outstanding ones, so nothing is left live
afterwards. A **spent** token on a verified account answers success, not
"invalid": mail clients prefetch links and people press back.

### Bot protection (`src/lib/turnstile.ts`, `src/lib/turnstileClient.ts`)
Cloudflare Turnstile on the three forms a stranger can POST to:
`/register`, `/login`, `/forgot-password`. It does **not** replace the
rate limiter and the limiter does not replace it — the limiter bounds how
fast one key can be hit, which does nothing about a hundred residential
proxies doing three requests each.

**Both keys or neither.** A site key without `TURNSTILE_SECRET_KEY`
renders a widget whose tokens could only be waved through unverified —
forms that look protected and are not. A secret without the site key
means no form can produce a token, so enforcing would refuse every visitor
on the site. Both half-configured states are treated as *off* and reported
as a **failure** on `/admin/diagnostics`.

**Unreachable Cloudflare is allowed through**, same reasoning as the rate
limiter's fail-open. A rejection Cloudflare actually issues is never waved
through; only the absence of an answer is.

**Tokens are single-use.** Cloudflare answers `timeout-or-duplicate` to a
second presentation, so a form that keeps its first token turns one
mistyped password into a form that never works again — and it surfaces as
"incorrect password", which sends the person looking in the wrong place.
`useTurnstile()` owns `reset()` after every attempt so that cannot be left
out of one of the three forms.

The split between the two modules matters: `turnstile.ts` reads the secret
and calls siteverify, `turnstileClient.ts` holds the script URL and the
public site key. Components import the client one — otherwise the
verification path ships to every visitor as dead code that looks like a
security boundary. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` must stay a **literal**
property access: Next substitutes it textually at build time, and a
computed lookup typechecks fine and arrives undefined in the browser,
which reads exactly like "Turnstile is switched off".

Putting the domain behind Cloudflare's proxy — WAF, DDoS absorption, Bot
Fight Mode — is DNS configuration this repo cannot do. See DEPLOY.md, 6.9.

### API routes (`src/app/api/`)
Every handler starts with `requireSession()` from `src/lib/authz.ts`, then
does its own ownership/collaborator check — there are no roles in the
kids-heaven sense (DIRECTOR/TEACHER/...), only **owner vs. collaborator**
scoped per vehicle:

```typescript
const auth = await requireSession()
if (!auth.ok) return auth.error
const { session } = auth
const vehicle = await requireVehicleAccess(vehicle_id, session.user.id) // src/lib/access.ts
if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

`requireVehicleAccess()` returns the vehicle with the caller's **`access`**
(`'owner'` or `'collaborator'`), else `null`. Mutating routes additionally
check `vehicle.access === 'owner'` (or use `requireVehicleOwner()`) where the
ticket requires owner-only (delete task, delete photo, change vehicle
settings, invite collaborators — see RL-031). **Never compare `ownerId` with
the caller** — for a company vehicle it names only the account of record
(see "Organisations"); `vehicleAccess.test.ts` greps the source for it.

### Project type configuration (`src/lib/projectType.ts`)
The single source of truth for category/status-tag/photo-type vocabulary per
mode. Never hardcode a category or status string in a route or component —
import `PROJECT_TYPE_CONFIG[vehicle.projectType]` and validate against it.
This is what RL-003/RL-004/RL-006 mean by "vocabulary adapts to project type."

`PROJECT_TYPES` and `isProjectType()` are **derived from the config's keys**,
not hand-written literal unions — adding a mode to `PROJECT_TYPE_CONFIG` (plus
the Prisma enum) is what makes it selectable, and the create form, the
community filter and the API validators pick it up without edits. Typing a
per-mode lookup as `Record<ProjectType, T>` makes `tsc` name any mode you
forgot; prefer that over an `if/else` on two of the three.

`config.tracksCompletion` says whether the mode works towards a finished
state. `OFFROAD`/`RESTORATION` do, so they show a completion % bar and can
read as "complete" in the community feed. `DAILY_DRIVER` does not — a repair
log just accumulates — so it shows a running job count and never reports
complete. Gate any new "how far along is this?" UI on that flag.

**`DAILY_DRIVER` deliberately has no project-only features**: no found state,
VIN decoder, trail log, originality score, or shareable build/transformation
card. Those are already gated by explicit `=== 'RESTORATION'` / `=== 'OFFROAD'`
checks, so a new mode is excluded by default — which is the behaviour you
want; don't "helpfully" widen those checks to `!== 'OFFROAD'` and the like.
It keeps everything else: tasks, photos, documents/reminders, costs and
analytics, wishlist (as "Planned work"), collaborators, PDF export, and the
public profile.

### Photo / file storage (`src/lib/storage.ts`)
No Supabase Storage — `saveUpload()`/`readUpload()`/`deleteUpload()` are a
small dual-backend abstraction keyed off whether `BLOB_READ_WRITE_TOKEN`
is set: local disk under `UPLOADS_DIR/<userId>/<vehicleId>/<uuid>` when
it isn't (dev), Vercel Blob when it is (production — Vercel's serverless
functions have no shared, persistent filesystem, so local disk silently
breaks there). Every route handler that reads/writes a file only calls
those three functions and never knows which backend is active.

Either way, the DB only ever stores a **storage key** (`userId/vehicleId/
uuid.ext`), never a public URL — `src/app/api/uploads/[...path]/route.ts`
is the only thing that turns a key into bytes, and it re-checks vehicle
access first. For the Blob backend this means every read does a `list()`
lookup by exact pathname then a server-side `fetch()` of the result — an
extra round trip, deliberate, so a raw (technically public, since Vercel
Blob doesn't support gated access) Blob URL is never handed to the
browser. Every filesystem/Blob write is wrapped in `try/catch` returning a
JSON 500, per the kids-heaven filesystem-writes pitfall.

`MAX_UPLOAD_BYTES` is 4MB, not the RL-016 ticket's 10MB — Vercel's
serverless functions cap request bodies around 4.5MB regardless of plan.
`src/lib/compressImage.ts` resizes images to ~1200px client-side before
upload (also completes RL-006's compression acceptance criterion, which
Phase 1 had left unwired), so this rarely bites for photos; a large PDF
receipt scan still can. See DEPLOY.md for the direct-to-Blob upload
alternative if that limit becomes a real problem.

### Adding a route
1. Create `src/app/api/<feature>/route.ts` (or `[id]/route.ts`)
2. Start with `requireSession()`, then `requireVehicleAccess()` for anything
   under a vehicle
3. Test in `src/__tests__/<feature>.test.ts` — mock `@/lib/prisma` and
   `next-auth`, import the route's `GET`/`POST`/etc. directly (see
   `src/__tests__/vehicles-api.test.ts` for the pattern)

### Wishlist / parts hunt (`src/lib/projectType.ts`, `wishlist/` routes)
One `WishlistItem` model backs both RL-011 (off-road wishlist) and RL-012
(restoration parts hunt); `config.wishlistStatuses` and `PART_CONDITIONS`
already existed from Phase 1 scaffolding. Two deliberate deviations from
the ticket text:
- **`category` is a required select**, not the optional free-text field
  RL-011 lists — every item needs one to convert cleanly to a task (see
  below), and the category breakdown card needs it too.
- **"Mark as installed/fitted" (`wishlist/[itemId]/convert/route.ts`)
  never copies `partCondition` onto the created task's
  `originalityCondition`** — they're different vocabularies (sourcing
  condition vs. authenticity) that only coincidentally share the value
  `REPRODUCTION`. Set originality on the task afterward if it applies.
- Reorder (`wishlist/reorder/route.ts`) takes the *entire* ordered id list
  and rejects anything that doesn't match the vehicle's current wishlist
  exactly — no partial reorders, so a stale client can't corrupt another
  session's ordering.

### Document reminders (`src/lib/documents.ts`, `documents/` routes)
`Document.reminderNSentAt` (N = 30/14/3) makes the reminder check
idempotent across cron runs, and resets to null on any PATCH that changes
`expiryDate` (renewing re-arms all three). `decideReminder()` in
`src/lib/documents.ts` is pure and unit-tested separately from the route —
if a document is created already inside multiple thresholds (e.g. expiry
in 10 days catches both the 30- and 14-day marks on the first check), it
sends **one** catch-up email, not one per threshold, and marks every
reached-but-unsent field so none of them fire again later as a stale
duplicate.

`/api/cron/document-reminders` (GET and POST, same handler) is wired to a
real scheduler when deployed on Vercel: `vercel.json` runs it daily via
Vercel Cron, which Vercel invokes with `GET` and an automatic
`Authorization: Bearer $CRON_SECRET` header. Off Vercel, point your own
scheduler (a crontab, GitHub Actions) at it with either that header or
`x-cron-secret: $CRON_SECRET`. In-app badge (vehicle dashboard "Documents"
link) and the historic-vehicle banner (`isHistoricVehicle()`, 30+ years
old → informational only, doesn't change reminder math) are built.
See "Email" below for the provider setup.

**Web Push too (#100)**: each recipient's subscribed devices get the
reminder as well, in their language. It is sent inside the same loop,
after the thresholds are marked, so it shares the email's one decision —
never a second send path with its own idea of what is due. A failed push
costs neither the email nor the next recipient (nor the reverse); a
404/410 deletes the subscription. It follows the device subscription, not
`notifyFollowedPush`: that flag is about projects you follow, and turning
push off in settings removes the subscription, which stops both.

### Email (`src/lib/email.ts`)
Two providers, chosen by **which API key is set** — Brevo first, then
Resend. Switching (or switching back) is an environment-variable edit, not
a code change; nothing provider-shaped escapes `sendEmail()`, and the
eight call sites don't know which is active. Brevo is the default because
it can verify a **single sender address**, so it works without owning a
domain; Resend requires a verified domain.

`EMAIL_FROM` keeps the `Name <addr@example.com>` form for both —
`parseSender()` splits it into the `{name, email}` pair Brevo wants. It
must name a sender you have actually verified with whichever provider is
active, or every send is rejected.

With **neither** key set, `sendEmail()` logs to the console. That is a
convenience in dev and a trap in production, so an unset key is logged at
error level there. Anything for which a missing email means the operation
truly failed — password reset — must call `isEmailConfigured()` and refuse
rather than returning its reassuring "check your inbox" message. That
check belongs *before* the user lookup, so its answer can't vary by
whether the address exists.

Provider rejections are logged with the provider's own response body and
the `from` address that was tried; without that the operator sees only a
generic 500 and the usual cause (an unverified sender) is invisible.

### Search and link previews (`src/lib/pageMetadata.ts`, `src/lib/structuredData.ts`)
The public pages are the only ones a search engine sees — everything else
needs a session — so the metadata on those five is the whole SEO surface.

`metadataBase` is set once in the root layout from `appUrlForMetadata()`,
the same resolver `sitemap.ts` and `robots.ts` use. Without it Next
resolves every relative `canonical` and social URL against
`localhost:3000`, which is a canonical pointing at a host Google cannot
reach — the one tag that must never be ambiguous, because getting it
wrong tells Search the wrong page is the real one.

`publicPageMetadata()` is what each public page returns. **It restates
`siteName` and `locale` deliberately**: a page setting its own
`openGraph` *replaces* the layout's object rather than merging into it,
which silently cost every one of these pages its `og:site_name` and
`og:locale`. Anything added to the layout's `openGraph` has to be
repeated there too. Note what its canonical does for `/community`: it
points at the unfiltered feed, so a filtered view is the same content
narrowed rather than a page competing with its own parent.

`structuredData.ts` is the JSON-LD. `SoftwareApplication` (on `/` and
`/demo`, under one shared `@id`, so the two pages describe one product
rather than two) carries the offers, built from `PERSONAL_PLANS` — the same
table the checkout charges against — with the free tier listed first,
because software shown at a price while a free tier exists reads as
paid-only. `WebSite` carries the search box, pointed at `/community`
since that is the only search a stranger can use. **No `aggregateRating`
and no `review`**: there are none, and inventing them is the single most
common way a site earns a manual action. Every value is derived from the
module that owns it rather than written out again, because structured
data that stops matching its page is a spam-policy violation, not just
untidy.

**There is no `FAQPage` markup, on purpose.** Google restricted the FAQ
rich result to health and government sites in 2023 and retired it
entirely on 7 May 2026, with the Search Console report and the Rich
Results Test following. The markup is still valid Schema.org and would do
nothing at all in Search. The questions live on `/demo` as ordinary
prose, which is what actually earns the long-tail query.

`serializeJsonLd()` escapes `<` so a string value can never close its own
`<script>` tag. Nothing here takes user input today; that function is the
boundary where it would stop being true.

### Absolute URLs (`src/lib/appUrl.ts`)
Every absolute link the server builds — reset emails, invitations, follow
and price notifications, document reminders, Stripe redirects, the sitemap,
public build URLs — comes from here. It used to be fourteen copies of
`process.env.NEXTAUTH_URL ?? 'http://localhost:3000'`, which meant one bad
variable broke all of them at once with nothing to notice (issue #21: a
base64 secret in `NEXTAUTH_URL` produced reset links to
`http://drrisq1f…echq=/reset-password?token=…`).

**`new URL()` is not validation** — the WHATWG parser accepts that string
as a hostname. Hence the explicit hostname regex. A test asserts no file
outside this module reads `process.env.NEXTAUTH_URL`.

**Never derive the origin from the request `Host` header.** That is
password-reset poisoning: an attacker sends `Host: evil.com`, the victim
gets a real token at the attacker's domain. Every source here is
configuration or platform-provided (`VERCEL_PROJECT_PRODUCTION_URL` before
`VERCEL_URL` — the latter changes every deploy and dies in an email opened
a week later).

Three callers, three behaviours, deliberately: `requireAppUrl()` throws
(Stripe redirects), `appUrlForNotification()` returns null and logs which
notification was skipped, `appUrlForMetadata()` falls back to localhost.
Outside production `resolveAppUrl()` falls back to localhost; in production
it returns null, because an email linking to localhost looks like it worked.

### Public site (`/`, `/demo`, `/tickets`, `/donate`)
`/` used to redirect to `/dashboard` or `/login`; it's now a real marketing
homepage, and four surfaces are readable with **no session at all**:
the homepage, the feature tour (`/demo`), the feedback board (`/tickets`)
and the donate page. They
share `PublicHeader`/`PublicFooter` (distinct from `Nav.tsx`, which is the
in-app header) — `PublicHeader` swaps its CTA to "Dashboard" when a session
exists. Marketing copy pulls prices from `LADDER` (`src/lib/plans.ts`) and mode names from
`PROJECT_TYPE_CONFIG` rather than restating them, so it can't drift.

**The feature tour** (`/demo`, `src/lib/demoTour.ts`) is the long version
of the homepage's six cards: every feature, in four categories, each
marked Free or Pro, each with a mock screen built from the app's own
components and invented rows. `DemoScreen` labels every one of those as
sample data — the previews are fabricated, and showing invented numbers in
the product's own chrome without saying so claims something the page
hasn't earned.

`DemoExplorer` is the page: pick a category, filter by plan or by mode,
click a feature, and its panel appears beside the list. Three things about
it are load-bearing rather than decorative.

**Every panel is in the first response, with `hidden` on all but one.**
Mounting only the selected one would leave all but one of the
features out of the page a crawler reads and out of the reader's Ctrl+F.

**Every feature is also named in plain, always-visible text**, in the
index at the foot of the page. Search does index hidden tab content but
does not weigh it the same as what is on the page, and the explorer hides
all but one of its panels — so the index is what puts every
feature name in the document unhidden. Its anchors open the matching
feature, via the hashchange handling below.

**A `<noscript>` stylesheet turns it back into the plain stacked page** —
it un-hides every `[data-demo-panel]` and removes every
`[data-demo-controls]`. Without it, scripting off means one feature
instead of a tour, and a row of buttons that cannot do anything. Anything
new that only works once React has hydrated needs that attribute.

**The hash is read on arrival *and* on `hashchange`.** `/demo#analytics`
is a link people share; changing only the fragment is a same-document
navigation, so a mount-only read would ignore a link from one part of the
tour to another. `replaceState` keeps the address bar on the open feature
without filling the back button, and does not fire `hashchange`, so the
two do not fight.

Since phase 5 and the fleet work it has six categories: the log, With
Personal, **Car records** (identity, odometer, fuel, receipt scan, Car
Health, tyres, cost of ownership, service book, passport, accidents),
**For companies** (organisation, fleet compliance and cost, drivers,
trips, reports), community and the app. A chapter's tier is one of three
— `free`, `pro` (sold as Personal) or `business` (a company plan) — and
`TIER_LABEL_KEY` / `TIER_BADGE` in `demoTour.ts` say how each is shown.
Those previews live in `recordPreviews.tsx` and `fleetPreviews.tsx`, with
the drawn pictures (car from the side and above, a fuel receipt, a file)
in `pictures.tsx`; several run the real function — `computeHealth()`,
`fuelSummary()`, `complianceBoard()`, `reconcileMonth()` — over invented
records dated relative to today. Plates on the tour use `00`, which is
never issued. The homepage reuses three of them (Car Health, the receipt
scan, fleet compliance) inside the same `DemoScreen` frame, so it cannot
show a mock the tour does not also label.

It is mock-ups rather than a shared demo account on purpose: an account
anyone can open is writable by everyone who finds it, needs seeding and
moderation, and cannot show a Pro feature without either granting Pro to a
public login or showing the upgrade wall instead of the thing being
demonstrated.

A tour rots quietly — nothing breaks when it goes stale — so the three
things that drift are not written in it. The vocabulary comes from
`PROJECT_TYPE_CONFIG` through `getAllVocabulary()` (`DemoModeSwitcher` is
the interactive proof of it), the free-tier numbers from `FREE_TIER` via
`chapterValues()`, and the prices from `LADDER`. Several previews go
further and run the real thing rather than describing it: `VinPreview`
calls `decodeVin()` on a well-formed UU1 chassis number (the local
Dacia/Renault-Romania path, so no network), `ShortcutsPreview` reads
`SHORTCUTS` and `formatKeys()`, `OriginalityPreview` uses the real
condition vocabulary, `RoadmapPreview` the real ticket statuses and their
palette, `InstallPreview` and `DataRightsPreview` the app's own strings. `demoTour.test.ts`
holds the rest: both languages cover every chapter, no chapter asks for a
placeholder the page doesn't pass, no string quotes a RON price that
didn't come from the ladder, and **no chapter links anywhere behind a
session** — a "see it live" pointing into `/dashboard` answers with the
login screen, and looks fine to whoever added it.

**Feedback board** (`src/lib/tickets.ts`, `Ticket`/`TicketVote`/
`TicketComment`). Reading is public; posting, voting and commenting need a
session. Two permission rules are load-bearing and separately tested:
- **an author may edit their own title/description but never their own
  status** — otherwise anyone could mark their own request PLANNED. The
  PATCH route checks the author branch and the admin branch independently,
  so a body carrying both fields is rejected outright rather than
  part-applied.
- **`TicketComment.isStaff` is snapshotted from the writer's `isAdmin` at
  write time**, never taken from the request body and never joined live —
  a client can't forge the badge, and revoking admin later doesn't rewrite
  old replies.

**One vote per user is a DB constraint** (`@@unique([ticketId, userId])`),
not an app-level read-then-write check — the latter races and a
double-click registers twice. `vote/route.ts` attempts the insert and
treats Prisma's `P2002` as "already voted", which is also the un-vote half
of the toggle. Don't replace that with a `findFirst` + branch.

**`User.isAdmin`** moderates this board and nothing else — it grants no
access to other users' vehicles or data, and is set directly in the
database, never through a route. `scripts/create-admin.ts` (`npm run
db:create-admin -- <email> [name]`) is the supported way to do that — it
creates or promotes an account against whatever `DATABASE_URL` points at,
prints the target database first, and is safe to re-run. It deliberately
does not go through `createUserWithFoundingGrant()`: an operator account
must not consume one of the hundred public founding-member slots.

### Donations (`src/lib/donations.ts`, `/donate`)
One-off Stripe Checkout, deliberately **not** behind `requireSession()` —
donating needs no account, and a session only attributes the row for the
public supporters list. Unlike `PERSONAL_PLANS`, donations use inline
`price_data` rather than configured Price IDs, so the supporter picks the
amount and **no extra Stripe dashboard setup is needed** beyond the
existing `STRIPE_SECRET_KEY`. Amounts are held in **bani** (integer minor
units) and validated server-side by `parseDonationBani()` — that function
is the only thing between a hand-crafted request and a charge.

**Donation sessions pass `managed_payments: { enabled: false }`.** Managed
Payments is Stripe acting as merchant of record, it is on by default for
accounts created since it shipped, and it refuses any line item whose
product carries no tax code — which an inline `price_data` product cannot
have. A donation has no product to classify: it is a contribution, not a
sale, so there is no honest tax code for it, and routing a gift through
merchant-of-record would have Stripe sell something on the site's behalf
and take a further cut. The paid plans (Personal and the company plans
alike) are deliberately **not** opted out:
their Prices are configured in the dashboard, where a tax code can be set,
so whether an actual sale uses merchant of record stays the operator's
call. Passing a new optional request parameter is backwards-compatible
across every Stripe API version, so this is safe on older accounts too.

A misconfiguration answers **503 `paymentsUnavailable`**, not the 500
`checkoutStartFailed` a real payment failure gets — `describeStripeFailure()`
(`src/lib/stripe.ts`) is what separates the two, and `StripeConfigError`
is what it keys off. The distinction matters because the two have
different owners: retrying never fixes the first, and telling a donor
their payment failed when the site was never set up is a lie that costs a
donation.

A `Donation` row is created `PENDING` at checkout and only the webhook
marks it `PAID`, the same rule as `User.isPro`: reaching the success URL
proves nothing. Donations and Pro purchases share the
`checkout.session.completed` event, told apart by `metadata.kind ===
'donation'` — **the donation branch returns early so a donation can never
fall through and grant Pro.** The `status: 'PENDING'` filter in its
`updateMany` is what makes a Stripe retry idempotent.

### Installing as an app (`src/lib/installPrompt.ts`, `public/manifest.json`)
Two things decide whether a browser offers to install this, and **both
fail silently** — valid manifest, no console error, the button simply
never appears.

**The manifest must declare a 192px and a 512px PNG.** Chromium does not
accept SVG for its installability check, so the SVG-only manifest this
shipped with was a perfectly valid manifest that was never installable.
The icons are rasterised from `public/icons/*.svg` by Chromium itself
(same engine that draws them on a home screen) and the SVG stays as the
favicon and iOS home-screen icon, declared in the layout's `icons`
metadata where SVG does work. `installPrompt.test.ts` reads the manifest
and pins the sizes. It cannot catch a manifest naming an icon file that
404s — that passes every static check there is — so fetch each declared
icon against a running build when you change them. (There is no live/e2e
suite checked into this repo; `npm test` is unit-only.)

**There is no browser pop-up, by design.** Deferring the event is what
suppresses Chromium's own banner, and the app does that so the offer can
be made somewhere chosen rather than wherever the browser felt like
interrupting. Having taken that on, the app has to actually make it:
`InstallPromptBanner` in the dashboard layout is where somebody meets it,
because the only other placements were the collapsed mobile menu and a
card on the settings page — so on a desktop browser an installable app
offered nothing anyone would find. It is dismissible, and a dismissal is
remembered for 30 days: returning tomorrow is nagging, never returning
punishes one mis-tap.

**The install card says why when it has nothing to offer.** It used to
return `null`, so the settings section rendered a heading with empty
space under it — indistinguishable from a broken one, which is exactly
how an SVG-only manifest went unnoticed. The full (non-compact) placement
now names the likely causes and offers `InstallDiagnostics`, which checks
on the device in front of the person the three things that are ours to
get right: secure context, a manifest with the required PNG icons, and a
registered worker. It cannot report *why* a browser withheld a prompt —
no browser says — and it does not pretend to.

**`beforeinstallprompt` has to be caught before hydration.** Chromium
fires it once, without replay, as soon as it judges the app installable —
routinely before the page's own bundle has run — so the listener
`InstallAppButton` used to attach in a `useEffect` heard nothing whenever
hydration lost that race. `INSTALL_PROMPT_SCRIPT` runs inline in `<head>`
alongside `THEME_SCRIPT`, for the same class of reason: it
`preventDefault()`s the event (which suppresses Chromium's own
mini-infobar and has to happen on the event itself), parks it on a
global, and raises `riglog:installprompt`. The component reads the global
on mount *and* subscribes to that event, so it is right on either side of
the race. **Don't add a `beforeinstallprompt` listener back into a
component** — it cannot hear what already happened, and it double-handles
the one that arrives late. The script is a string nothing type-checks, so
its test executes it against a stub window.

### Which build you are running (`src/lib/version.ts`, `src/lib/serviceWorker.ts`)
The version is resolved in `next.config.mjs` and inlined at **build** time
through `env`. That timing is the requirement, not a convenience: this is
a PWA, so the bundle in somebody's browser can be older than the code on
the server, and a version read per request would report the current deploy
to a person whose tab is three deploys behind. `NEXT_PUBLIC_*` must stay a
**literal** property access or the substitution does not happen (same trap
as the Turnstile site key).

**Nothing invents a version.** Every resolver falls to null and
`versionLabel()` returns null rather than a string, so the screens render
their own translated "unknown" — a number shown here is quoted back in a
bug report as fact. The **commit** is the identity, not the semver:
`package.json`'s version is a label somebody has to remember to bump, and
this repo already has one constant that rots exactly that way
(`LEGAL_LAST_UPDATED`).

**The service worker is generated per build**, from
`serviceWorkerSource()` via `src/app/sw.js/route.ts`, and it used to be
`public/sw.js` with `CACHE_NAME = 'riglog-shell-v1'`. Two things followed
from that pinned name, both invisible. The `activate` handler deletes
every cache whose key is not the current name — with a name that never
changed, it could never match, so it was dead code and the shell cache
accumulated across every deploy since RL-010. And a browser only installs
a new worker when the script's **bytes** change, so a byte-identical
static file meant no new cache name could ever have taken effect anyway.
Serving it with the build id interpolated fixes both at once. Don't move
it back into `public/`.

**The worker does not `skipWaiting()` on install.** It waits, and
`ServiceWorkerRegistration` offers the reload. Two guards there are
load-bearing and both look removable: the update is announced only when
`navigator.serviceWorker.controller` is non-null (otherwise a first-ever
install is announced as an update to a brand new visitor), and the reload
on `controllerchange` fires only when the person accepted (otherwise
`clients.claim()` on that same first install reloads them, and again on
the next one).

A bug report carries `Ticket.appVersion` — the build the **reporter's
browser** said it was running, sent from the client because that is the
only thing that knows it. It is untrusted and goes through
`sanitizeReportedVersion()`; it is not a privilege claim like
`TicketComment.isStaff`, so it may come from the body, but it is rendered
on an admin screen and is bounded and stripped first. A ticket whose
version differs from `/admin/diagnostics` means that reporter was on an
older bundle — which is a finding, not a fault.

**There is no `/changelog`.** Considered and left out: an entry per
release, in both languages, with nothing generating it, is a page that
goes stale and then misleads. The version string plus the update prompt
answers the question people actually have ("am I on the fixed one?")
without anything to maintain.

### Language (`src/i18n/`, `messages/{ro,en}.json`, `src/lib/vocabulary.ts`)
next-intl, Romanian default, English second. **The locale is a cookie
(`riglog-locale`), not a URL segment** — no `[locale]` route, no
locale-aware `Link`; `src/i18n/config.ts` explains the trade. There is no
middleware, which is why `request.ts` reads `requestLocale` rather than
next-intl's deprecated `locale` param (destructuring that one 404s every
page here).

Two stores on purpose: the cookie drives what the screen renders,
`User.locale` drives email, because reminders and notifications are sent
from cron/background paths in the **recipient's** language. Those paths use
`translator(locale, namespace)` (`src/i18n/translator.ts`), not
`getTranslations()`, so they need no request context and stay unit-testable.

**Stored values are never translated.** `PROJECT_TYPE_CONFIG` stays the
vocabulary; `vocabulary.ts` only swaps labels, and every validator reads the
config, never a catalogue — otherwise a request's language would change
what a route accepts. `SERVER_ONLY_NAMESPACES` are stripped from the client
payload (legal prose etc.); a `'use client'` file reading one fails
`i18n.test.ts`, which also requires both catalogues to have the same keys,
placeholders and rich-text tags. Any new user-facing string goes into
**both** `messages/ro.json` and `messages/en.json`.

### Theme (`src/lib/theme.ts`, `src/app/globals.css`)
Light/dark/system, `darkMode: 'class'` on `<html>`. Nothing re-themes by
hand: `surface`/`ink`/`background` are Tailwind tokens backed by CSS
variables (`rgb(var(--x) / <alpha-value>)`), so flipping `.dark` re-colours
every existing `bg-surface`/`text-ink` in the app. Adding a literal colour
to a component is how that stops being true.

Badges and callouts are named by **meaning**, not hue — `badge-success`,
`badge-warn`, `note-warn` (globals.css) — because each needs a dark
counterpart and spraying `dark:` over every call site is how half get
missed. They live inside `@layer components` and must stay there:
**Tailwind silently drops any variant used inside `@apply` outside a
layer**, with no warning and no build error, so the `dark:` half of every
badge compiled to nothing and the theme looked finished while every badge
still rendered its light palette. `globalsCss.test.ts` pins that, and
checks `:root` and `.dark` define the same variables. Recharts can't see CSS variables (it writes literal SVG colour
props), so charts call `useChartTheme()`, which watches the class on
`<html>`.

The preference is in localStorage, not a cookie — a per-device display
setting has no business on every request, and keeping it out of cookies
keeps it out of the consent story. `THEME_SCRIPT` is inlined in `<head>`
and runs before first paint so there's no white flash; it's a string
nothing type-checks, so `theme.test.ts` executes it for real (a throw there
is a blank page, not a wrong colour).

### Vehicle identity (`src/lib/vehicleProfile.ts`, RL-050 — phase 5 slice 1 of #49)
Plate and talon fields on `Vehicle`, all optional (a barn find has none).
Fuel type and gearbox are stored as codes and labelled from the
`vehicleProfile` catalogue, like the project-type vocabulary. The plate is
**not** validated against the Romanian format (temporary, foreign and
historic plates are real), only charset and length. It is identifying, so
like the raw VIN it is **never rendered on a public surface**;
`vehicleProfile.test.ts` reads every public page/card/sitemap file to hold
that line. When testing that by hand, don't use `B 123 ABC` — it is the
input placeholder and ships in every page's catalogue payload.

### Odometer history (`src/lib/odometer.ts`, `odometerRecords.ts`, RL-044 — slice 2)
**Current mileage is derived from the newest `OdometerReading`, never
stored on `Vehicle`** (a test reads the schema for that). Readings stay in
**date** order — each must sit between its date neighbours, so back-filling
old history is fine — and a refusal (409) names the reading it collided
with. The two real exceptions (`CLUSTER_REPLACED`, `CORRECTION`) are kept as
`isOverride` with a reason; an override starts a new segment and bounds are
never checked across one. Same-day readings don't bound each other.

Readings arrive three ways: by hand (owner or active collaborator; a
collaborator deletes only their own), as `odometerKm` on a job (written in
the same transaction, so a refused km refuses the job; the job's date moves
its reading), and from the restoration intake (`FoundState.odometer`, kept
in step and backfilled by the migration, deliberately not order-checked).
Future-dated readings are refused. `distanceCovered()` sums per segment —
it is what cost per km (slice 5) must use.

### Fuel log (`src/lib/fuel.ts`, RL-044 — slice 3)
`FuelEntry` stores litres and the total only; price per litre is derived.
The km at the pump is an `OdometerReading` (source `FUEL`) written in the
same transaction, so a km that breaks the history refuses the fill-up.
**Consumption is only measured between two full tanks** — partials in
between add their litres but never close an interval, an end without km or
an odometer override inside it drops the interval, and the average is total
litres over total km (not a mean of ratios). No estimate is ever shown.

Deleting a fill-up (or a job) deletes the reading it created and its files.
Receipts are filed under the vehicle **owner's** prefix whoever uploads them,
and are listed in `collectStorageKeys()`.

### Scanning receipts and invoices (`src/lib/ocr.ts`, `ocrText.ts`, `receiptParse.ts`, `invoiceParse.ts`, RL-048)
Tesseract.js (Apache-2.0), **run in the browser**, on the fuel form (a fuel
receipt) and the new-job form (a service invoice). The
photo is read on the device and never sent anywhere to be read, so there is
no OCR sub-processor and no per-scan cost; the model is cached in IndexedDB
(listed in `LOCAL_STORAGE_ENTRIES`). It is a paid feature — the vehicle's
plan (`vehicleHasPro()`), like every paid feature on a vehicle — and a UI
gate only, since there is nothing on the server to meter.
- **Every file is served from this site.** `scripts/copy-ocr-assets.js`
  (postinstall and `vercel-build`) copies the worker, the three LSTM cores
  and the Romanian `best_int` model into `public/ocr` (gitignored).
  Tesseract.js fetches anything it is not given a path for from jsDelivr,
  so `ocr.ts` always passes all three and `workerBlobURL: false`; the CSP
  has `worker-src 'self'` and `'wasm-unsafe-eval'` for it. `ocr.test.ts`
  holds the wiring, including that no other file imports `tesseract.js`.
- **It proposes, never saves**: the scan fills the form and the person
  adds it. A value read below `MIN_CONFIDENCE` is dropped and flagged;
  litres × price that doesn't match the total makes all three unsure; a
  missing figure is never derived from the others. A scan that reads
  nothing says so and leaves the photo attached.
- **The photo is cleaned first** (`receiptImage.ts`, pure): the lighting is
  flattened — each pixel divided by its cell's 90th-percentile brightness
  (cells 1/60 of the page, bilinear between them) — then contrast-stretched.
  A global stretch alone fails a hand's shadow, a dark counter and faded
  print. **Don't smooth the estimate across cells** (max, median or mean):
  each carries the paper's brightness out over its surroundings, leaving a
  dark band along the receipt's edge that Tesseract drops the first letters
  of each line with ("SERVICE" → "VICE"). Also tried and measured worse:
  whitening above an Otsu cut (erases faded print) and erasing table rules
  (anti-aliased remnants lower the digits' confidence). Never thresholded.
  Small text is upscaled up to 2× towards 2000px.
- **Two looks, merged conservatively** (`scan()` in `ocr.ts`): sparse text
  first; only if what the form needs isn't confirmed, single-block on the
  same loaded engine. The merge takes the money fields as a group from the
  reading that verified more, and a field the two read differently is
  unsure. Shared reading helpers (confidence per value, numbers, dates,
  row rebuilding) live in `ocrText.ts`.
- **Rows are rebuilt from geometry** (`mergeSplitRows()`): Tesseract returns
  "TOTAL LEI" and its right-aligned "233,32" as separate lines; fragments
  side by side whose baselines meet (along their slope, so tilted photos
  work) are one row.
- **The fuel line's own amount** (`… L x 7,29 = 441,41`, or alone on the
  next row) checks litres × price and is the fuel total — the receipt's
  TOTAL may include a coffee. The tolerance is **from the printed precision**
  (`arithmeticTolerance()`), not fixed: 0.10 lei let `25,000` L misread as
  `25,006` through.
- `receiptParse.test.ts` is the Romanian formats: comma decimals, the VAT
  line that isn't the total, month names, future/validity dates skipped,
  and the chains ("OMV PETROM MARKETING" is printed by both OMV and Petrom,
  so it names neither). On a bench of 5 chain layouts × 7 damage kinds
  (shadow, dim, noise, tilt, faded, far) rendered in Chromium it reads
  171/175 fields right and none wrong; real crumpled receipts are still the
  open question — add a failing one's OCR lines as a test case.

**Service invoices** (slice 2, `invoiceParse.ts`) propose a workshop job:
workshop, date, km, invoice number, parts and labour. The invoice is
attached to the job as its receipt once the job is saved.
- **Money only when the lines add up** to the amount to pay ("de plată"):
  each row is read as gross (last figure) or net + VAT (last two), and the
  reading that reaches the total is used; one doubtful figure, or neither
  reading adding up, proposes no parts/labour at all (the total is shown
  in the flag). An invoice that prints VAT only in its footer gets no
  split — spreading it by a rate would be a figure the app made up. A
  footer that prints its own "total piese / total manoperă" is used when
  those add up.
- Parts vs labour is per line, from its wording or an hours unit; every
  line goes into the notes with its amount and kind, so the split is
  checked against the paper before saving.
- Rows: a cell that wrapped comes back as two fragments; neighbours each
  short of the table's usual number of figures, together exactly that many,
  are joined (columns back in page order; a wrapped receipt line keeps
  reading order), and a description-only line joins the nearer row. A line
  before the first row counts only if numbered — otherwise it is the
  header's second line ("serviciu" would read as labour). The sum check
  still has to pass, so a wrong join can only fail, not propose.
- The workshop is the supplier ("Furnizor"), never the customer — on a
  company car that is the reader's own company. The due date
  ("Scadență") is skipped even on the issue date's line; a km figure that
  runs into more digits is not taken.
- Bench: 4 layouts (VAT table, a wrapped brake table, a workshop receipt, a
  footer summary) × 6 damage kinds: 83/114 fields right, none wrong. Table
  invoices read fully when clean; under damage the grid lines touch the
  figures and the split falls back to unsure — safe, but that is the next
  thing to improve with real photos.

### Car Health (`src/lib/vehicleHealth.ts`, RL-046 — slice 4) and tyres (`src/lib/tyres.ts`)
`computeHealth()` is pure and returns rows (documents per type, service,
tyres, open jobs) plus **one** next action; `VehicleHealthPanel` renders it
and is meant to be reused by the garage cards and fleet board rather than
re-derived. Rules that are load-bearing, and tested:
- **Never a rating** — no score/grade/percentage (a test greps the module).
- **Nothing recorded is `none`, never `ok`.** An empty vehicle is unknown,
  not healthy.
- **Restoration:** document rows are `info` only, no service or tyre rows.
  Historic status changes nothing.
- Document days come from `getDocumentStatus()` — the same function as the
  documents board and the reminder cron — so the three cannot disagree.
- Service distance is only measured with a reading **on** the service day
  and one after it; otherwise it falls back to time. The 15,000 km / 1 year
  interval is an assumption and every message says so. The service
  category per mode is `config.serviceCategory` (null for restoration).
- **The owner can set their own interval** (#104,
  `Vehicle.serviceIntervalKm`/`serviceIntervalMonths`, on the edit form).
  Its messages state that figure and never say "assuming". Set only one
  half and the other is **not** filled in from the default — that would
  state something the owner never said; a distance-only interval with no
  measurable distance is `none`. Months count on the calendar. Overdue
  names only what has run out, not the half still to go.
- Every quoted key in the module must exist in both catalogues; the test
  collects every quoted `area.`/`service.`/`nextAction.`… string, not only
  `key: '…'`, since a key picked by a ternary once shipped missing.
- Every message key the module emits must exist in both catalogues (test).

`TyreSet` is a set, not a tyre; at most one per vehicle is fitted (fitting
one unfits the rest in the same transaction). Tread depth is stamped with
the day it was measured.

### Cost of ownership (`src/lib/ownershipCosts.ts`, RL-045 — slice 5) and values/finance (RL-050)
**Cost stays on the thing it describes and TCO is a union over them** —
Task (via `taskTotalCost()`, the analytics function), FuelEntry, Document
(`costRon` + `paidAt`), TyreSet (`costRon` + `purchasedAt`), Vehicle
(purchase, monthly finance payments) and `VehicleExpense` for the long tail
(tax, tolls, parking…). `MONEY_COLUMNS` names every `*Ron`/`*Bani` column in
the schema as counted or excluded-with-a-reason; `ownershipCosts.test.ts`
reads the schema, so **a new money column fails the build until you decide
about it there**.
- **Nothing is estimated.** `currentValueRon` is the owner's own dated
  estimate, shown beside the total, never a cost line (no depreciation).
- **Cost per km** counts only the stretch the odometer covers inside the
  period (`distanceCovered()`), with only the running costs paid inside it
  (purchase excluded). `coverage` lists every gap instead of hiding it.
- **The purchase lives on `Vehicle` for every mode**, a restoration's
  included: the intake form reads and writes `purchaseDate`/
  `purchasePriceRon` there (answering under its old names,
  `acquisitionDate`/`purchasePriceRon`), and nothing else holds a copy
  (#105). Once a restoration has an intake, its purchase date can be
  changed but not cleared — the intake requires one. FoundState's two old
  columns are still in the database, nullable and unread, until the next
  release drops them: dropping a column in the release that stops reading
  it breaks the previous deployment while it is still serving.
- **A document is renewed in place**, so a renewal moves the old period's
  price into a `VehicleExpense` (same category) before the new one is set —
  otherwise last year's premium would vanish from the total.
- No finance type means no payments, whatever amounts are left behind.
- The vehicle's money columns are Decimal: `serializeVehicle()` on every
  vehicle JSON response (it also nulls them for a collaborator under
  `hideCostsFromCollaborators`), and map them with `toNumberOrNull()` before
  handing a vehicle or document to a client component.
- `costKinds.ts` holds the vocabulary so client components can import it;
  `ownershipCosts.ts` is reached from a client component via `tyres.ts`, so
  it must not import `amounts.ts`/`apiError` (a test holds that — the
  failure otherwise only shows in `next build`).
- Free: the total and its gaps. Pro (the owner's): breakdown, entries, cost
  per km, period filter.

### Service book (`src/lib/serviceBook.ts`, RL-047 — slice 6)
A **view over completed jobs** (`config.completeStatus`), never a second
place to record work — to change an entry you edit the job. The page and
the PDF both read through `loadServiceBook()` so they cannot list
different jobs; the km is the reading written with the job, and cost is
`taskTotalCost()`. Rows go by date, then km on the same day; a replaced
cluster/correction between two rows is **marked on the row** (the km
restarts), a km below an earlier row is flagged rather than reordered, and
a job entered more than 30 days after its date says "logged on …". The PDF
(`pdfServiceBook.ts`, third document on the RL-014 engine, no photos)
states that it is a record kept by the owner that RigLog does not verify.
Reading is free (collaborators too, without costs under
`hideCostsFromCollaborators`); the export is the owner's and Pro. No plate
or VIN is printed — that choice belongs to the passport (RL-049).

### Vehicle Passport (`src/lib/passport.ts`, RL-049 — slice 7)
The first thing RigLog produces that can move somebody else's money, so its
honesty rules are the point and each is tested (`passport.test.ts`):
- **It says what it is in its heading** (`passport.what`: the owner's own
  records, not a history report, registry check or inspection), on the
  page and directly under the PDF title — never only in a footer.
- **Every absence is an absence of records** — each `absence.*` string
  names RigLog, and no catalogue string may claim a clean history ("no
  accidents", "verified", "certified"…). With no accident records the
  passport says `absence.noAccidentsRecorded` ("none recorded in RigLog…
  not the same as none having happened"); with some, it lists them with
  when each was entered, and `accidentsNote` says to check the insurer's
  claims history.
- **Gaps of a year or more are listed** (`recordGaps()`), including before
  the first and after the last entry — an empty history is one long gap.
- **Each job shows when it was entered and last changed** beside when the
  work happened (`ServiceRow.recordedAt`/`changedAt`); the rule is printed.
- Jobs come through `loadServiceBook()`, so passport and service book agree.
- **Every section is tagged "Owner's view"** (`passport.ownerView`) — each
  `<h2>` on the page, each PDF heading and every PDF page footer — and the
  header adds `ownerViewAdvice` (check against receipts, an inspection and
  the registry). A screenshot of one section or one printed page must
  still say whose account it is; a test fails on an untagged heading. The
  service book carries the same label, shown to everyone who reads it
  (collaborators too), and on every page of its PDF.

Sharing is a `PassportLink` token (32 random bytes) at `/passport/<token>`:
session-free, `noindex`, `no-referrer`, disallowed in robots. **One live
link per vehicle** — creating one withdraws the rest in the same
transaction. Withdrawn and unknown tokens render the same "not available"
page. Plate and VIN are **off unless chosen per link** (RL-050); costs can
be switched off. Photos appear only for a vehicle that is already public,
through RL-018's existing uploads carve-out — **a passport link must never
widen `/api/uploads`**. Creating a link and the PDF (a dated snapshot) are
owner + Pro; **withdrawing needs no Pro**, so a lapsed seller can still take
it down; existing links keep working if Pro lapses. The data export lists
links without their tokens.

### Accidents and damage (`src/lib/accidents.ts`, RL-050 — slice 8)
`Accident` (date, kind, description, km, insurance route, repair date and
cost) with up to `ACCIDENT_PHOTO_LIMIT` `AccidentPhoto`s — images only, filed
under the vehicle **owner's** prefix whoever uploads, and listed in
`collectStorageKeys()`. Deleting a record deletes its files. Owner or active
collaborator adds; a collaborator changes/removes only their own. Free.
- The km is **not** an `OdometerReading`: damage found later has a guessed
  date, which must not bound the mileage history.
- `repairCostRon` is **excluded** from the cost of ownership (`MONEY_COLUMNS`
  says why): the repair is logged as a job, which already counts. The form
  says so.
- Never on a public surface: the build pages don't read accidents (a test
  walks `src/app/builds`), and the passport lists records but only **counts**
  their photos — it never loads the keys.

Phase 5 follows the adapted plan on #49 (one additive migration per slice,
each slice deployable alone): identity → odometer → fuel log → Car Health
→ TCO → service book → passport → accidents; OCR waits on a provider
choice.

### Organisations (`src/lib/organizations.ts`, RL-038 — fleet slices 1–4 of #49)
`Organization` (name, CUI, billing address) and `OrganizationMember` (one
per person per organisation — a DB constraint — with a role: `OWNER`,
`FLEET_MANAGER`, `MECHANIC`, `DRIVER`).

**Company vehicles (slice 3) — the permission model, in `access.ts` only.**
A vehicle with `organizationId` is the company's: OWNER/FLEET_MANAGER get
`owner` access, MECHANIC/DRIVER get `collaborator`, and an outside
collaborator invited to it keeps `collaborator`. Its **`ownerId` is only the
account of record** (storage prefix only — paid features on a company
vehicle follow the organisation's plan, `vehicleHasPro()`) and grants
nothing — a mover who is later removed or demoted loses access
like anyone else. `vehicleAccess.test.ts` is the whole table, test-first,
plus a grep that fails on any `ownerId` comparison with the caller outside
`access.ts`. Membership is read per request, so removal is immediate.
- Lists never go by `ownerId` alone: `listAccessibleVehicles()` (garage,
  `GET /api/vehicles`); personal-only views (garage spend, onboarding, the
  data export, the free-tier count) add `organizationId: null`.
- Owner-facing mail (document reminders, price alerts) goes to
  `vehicleManagers()` — the organisation's OWNERs and FLEET_MANAGERs for a
  company vehicle; the "collaborator added a job" email is not sent for one.
- **Never public** — refused on the PATCH and by a CHECK constraint in the
  migration. Moving in (`POST /api/vehicles/[id]/organization`: the personal
  owner, into an organisation where they are OWNER/FLEET_MANAGER) unpublishes
  it. Followers of a vehicle that is no longer public are not notified
  (`notifyFollowers` checks `isPublic` — it didn't before).
- **Moving out** (slice 4, `DELETE` on the same route): an OWNER or
  FLEET_MANAGER takes it into their own garage — they become `ownerId`,
  the slug is cleared, and it counts against *their* free-tier limit.
  Collaborators invited to the vehicle directly keep their access.
- **Deleting an organisation with vehicles** deletes them, their records
  and files, and needs `confirmName` equal to its name (the form makes the
  owner type it; moving a vehicle out first is the way to keep it). Keys are
  gathered first and the vehicles deleted *by those ids*, so one moved in
  meanwhile trips the Restrict FK (409) rather than losing its files.
  Deleting an account hands company vehicles it is the record for to another
  OWNER there (slug cleared), and an organisation that goes with the
  account takes its vehicles and their files.
- **Who can create one:** anyone, once organisation billing is configured
  (all ten company Prices — `isOrgBillingConfigured()`); until then the
  closed beta — `User.orgBetaAt`, set by an admin on `/admin/users/[id]`,
  or being an admin — and a beta organisation is created comped.
  `canCreateOrganization()` takes that flag rather than importing Stripe,
  so the module stays client-safe. Read from the database (not the
  token), rate-limited per user id. The header's **Business** entry (`showsBusiness()`:
  can create, or is a member) goes to `/dashboard/business`, which
  redirects to the one organisation's fleet board (its org page for a
  mechanic/driver) or to the list. `/admin/organizations` lists every
  organisation (owners, member and vehicle counts) and the beta accounts,
  **read-only** — it links nowhere into an organisation's screens, since
  `isAdmin` grants no access to anyone's records (a test holds that).
- **Owners run it** (details, roles, removing people, deleting it); anyone
  can leave. An outsider gets 404. Members' addresses are shown to owners
  only.
- **There is always an OWNER.** The last one cannot be demoted, removed or
  leave (`lastOwnerBlocks()`), counted under `SELECT … FOR UPDATE` on the
  organisation row (`lockOrganization()`), or two owners demoting each
  other at once would both succeed.
- **Deleting an account** removes its memberships and any organisation
  nobody else is in, and is **refused (409, naming them)** while it is the
  last owner of an organisation other people are in. `SettingsForm` only
  signs out once the server confirms the deletion.
- The data export lists the account's organisations and role, not the
  other members.
- **Invitations** (`src/lib/organizationInvites.ts`, slice 2) are the
  collaborator flow (32-byte token, 7 days, resend = new token and a fresh
  7 days, withdraw) with one difference: **only the token's SHA-256 is
  stored**. Owners invite, with a confirmed address (both the invite and
  the resend are in `emailVerification.test.ts`'s gated list), rate-limited
  per user id, at most `ORG_PENDING_INVITE_LIMIT` open per organisation.
  Accepting (`/organizations/accept`) needs a session whose email is the
  invited one; claiming the invitation is a conditional `updateMany` in
  the same transaction as the membership, so a double click or a
  simultaneous withdrawal cannot make a member.

### Drivers (`src/lib/assignments.ts`, RL-040 — #52)
`VehicleAssignment` is a history (driver, from, to, note), not a column.
Assignments start when made and end when ended — never back-dated — so
**one active driver per vehicle** is a partial unique index (`endedAt IS
NULL`) in the migration, and a second is a 409 from the database, not a
form check. Managers assign (`/dashboard/vehicles/[id]/drivers`); a manager
or the driver ends one.
- **Access:** a DRIVER member gets `driver` access (`access.ts`) only while
  assigned to that vehicle — no assignment, no vehicle; the garage lists
  only theirs. `driver` is not `owner`, so every owner-only check already
  refuses it.
- **Costs: one rule, `hidesCosts(vehicle)`** — never from the owner, always
  from a driver, from a collaborator under `hideCostsFromCollaborators`.
  Every page and route showing money asks it (a test forbids re-deriving it
  from the flag), and responses that echo an amount back (a job, a fill-up,
  a tyre set, an expense, an accident, the found state) null it. Tested on
  the API responses themselves (`driverCosts.test.ts`). A hidden viewer's
  edit form starts blank, and blanks are not sent, so saving never wipes a
  stored amount; the found-state PUT keeps the stored price outright.
- Someone who stops being a DRIVER (removed, or another role) and a vehicle
  moved out of the organisation have their active assignments ended in the
  same transaction — a stale "active" row would grant nothing yet block the
  next driver.

**The driver's side** (slice 2). `DriverPanel` sits at the top of the
vehicle page for `driver` access only: report a defect, fuel, a toll/cost,
km, documents, and the handover.
- **A defect is an ordinary job** through the normal create route, never a
  second kind of record: `config.defect` (per mode, like `serviceCategory`)
  gives its category, a status whose tone is warn/danger — so it reads as
  needing attention on the manager's garage (a test holds the tone) — and
  the photo type. Null for restoration: nothing to report. Read from
  `PROJECT_TYPE_CONFIG`, not the translated vocabulary: they are stored
  values.
- **Documents** are the owner's screen and, read-only and without costs,
  the assigned driver's; nobody else's.
- **Handover**: the km at each end is an `OdometerReading` (source
  `HANDOVER`) written in the transaction that starts or ends the
  assignment (`writeHandoverReading()`), so a km that breaks the history
  refuses the handover (409 naming the reading). Ending is conditional, and
  a second end rolls its reading back. A start without a km (assigned from
  the office) is completed once by `/start`. Condition photos
  (`AssignmentPhoto`, START/END, six each, images only) are uploaded
  **before** ending, while the driver still has access; they are evidence,
  so there is no delete. They are in `collectStorageKeys()`.

### Fleet compliance and cost (`src/lib/fleet.ts`, RL-039 — #51)
`/dashboard/organizations/[id]/fleet`, for OWNER/FLEET_MANAGER (404 for
anyone else): every company vehicle × `FLEET_DOCUMENT_TYPES` (ITP, RCA,
CASCO, rovinietă, first-aid kit, extinguisher — not the travel vignette).
`complianceBoard()` is pure and every day count is `getDocumentStatus()`,
the function the documents board and the reminder cron use.
- **Off the road today** (anything expired) is counted and sorted first,
  then by soonest expiry; nothing recorded is `none` and sorts last —
  unknown, never fine.
- **Every vehicle, never a page of them** (a test forbids `take:`): a
  partial fleet answer is worse than none. Two queries for the lot.
- Historic status is a label only and changes no count.
- Reminders for company vehicles go to each OWNER/FLEET_MANAGER; the
  thresholds are marked once per document before sending, so nobody gets a
  duplicate, and one recipient's failed send is caught so the next still
  gets theirs.
- No site/depot filter: organisations have no depots yet.

**Fleet cost** (slice 2, `/fleet/costs`, same roles): `fleetCost()` is
`ownershipReport()` per vehicle, added up — a vehicle's line is the total on
its own costs page. Both pages load through `loadOwnershipInputs()`
(`src/lib/ownershipRecords.ts`: six batched queries for any number of
vehicles, Decimals converted), so they cannot add up different rows.
- Running cost leaves out the purchase; per vehicle per month is running
  cost over **vehicle-months** owned in the period, so a van bought last
  month doesn't count as a year.
- Nothing is estimated: vehicles whose report lists coverage gaps are
  counted and badged, linking to their own page.
- The trend is running cost per calendar month, empty months as zero, the
  last `FLEET_TREND_MAX_MONTHS`; colours from `useChartTheme()`.

**Fleet reports** (RL-041, #53, `/fleet/reports`, same roles):
`src/lib/fleetReport.ts` (pure) and three routes under
`/api/organizations/[orgId]/reports/` — `jobs` (CSV), `costs` (CSV, every
cost line with the driver assigned that day) and `summary` (PDF on the
RL-014 engine, `pdfFleetReport.ts`). All three go through `loadReport()`
(`reports/load.ts`) before reading anything; a test holds that.
- **Checked on the server**, whatever the form sent: OWNER/FLEET_MANAGER
  (404 otherwise), the `fleetReport` rate limit per user id, whole days
  with `from` ≤ `to` and at most `REPORT_MAX_DAYS` (366), and a `vehicle`
  that is this organisation's (404 otherwise). Only current vehicles.
- Figures come from `costLines()` and `taskTotalCost()` — the costs page's
  own lines — so a file cannot add up differently from the screen.
- **Drivers**: costs are dated by the day and assignments to the minute,
  so a handover day names both drivers; no assignment, empty.
- **Renewals**: a document is renewed in place, so the PATCH that moves
  an expiry *later* writes a `DocumentRenewal` (previous and new expiry)
  in the same transaction; moving it earlier is a correction. Renewals
  before September 2026 were never recorded and the PDF says so. An
  expiry counts once its day is over; one renewed ahead of it never
  lapsed and is listed only as a renewal.
- **CSV** (`src/lib/csv.ts`, the first in the repo): a field starting
  `=`, `+`, `-`, `@` (or tab/CR, or spaces then one of those) gets a
  leading `'` so Excel does not run it; every field quoted; `;` between
  columns (the comma is the decimal); a UTF-8 BOM. Amounts in a CSV are
  the figure alone (`14.999,50`) under a "(RON)" header, so the column
  still sums.
- **`formatRon()`** (`src/lib/money.ts`) is the one way to write RON
  (`14.999,50 RON`); the fleet pages and the service-book PDF use it, and
  the rest of the app can move over as it is touched.
- `fleetReport` is a server-only namespace (the page is a Server
  Component). Filenames are ASCII slugs — they go into a header.

### Trips (`src/lib/trips.ts`, `tripRecords.ts`, `tripSheet.ts`, RL-051 — #64)
A `Trip` (day, from → to, purpose, `BUSINESS`/`PERSONAL`) whose two ends
are `OdometerReading`s (source `TRIP`) written in the trip's transaction
and checked like any other reading — **the distance is never stored**
(a test reads the schema). Deleting a trip deletes those two readings;
deleting a reading by hand leaves the trip without a distance, counted
and shown rather than read as zero.
- **Who** (`tripGate()`): a company vehicle's managers and its assigned
  driver; a personal vehicle's owner when the account of record has Pro;
  never a collaborator. A driver logs, sees, removes and exports only
  their own; a manager may log one for a member of the organisation.
  `driverName` is snapshotted so a deleted account leaves a readable sheet.
- **Gaps are shown, not smoothed** (`reconcileMonth()`): the month's
  odometer span runs from the last reading before it to its last one;
  every stretch no trip covers (before the first, between two, after the
  last) is listed with its km, an overlap as a negative, and a replaced or
  corrected odometer in between as unknown. A driver's view reconciles
  nothing — other people's trips fill their gaps.
- **Fuel by distance** (`fuelSplit()`): the month's fuel over odometer km,
  times business/personal/unlogged km — labelled as an allocation, never a
  measurement, and only for someone who sees costs.
- **Not a foaie de parcurs.** What ANAF requires on one was not
  established, so per the ticket it ships as a CSV of the trips as
  recorded, and the pages say so. Per vehicle
  (`/api/vehicles/[id]/trips/export`, with the reconciliation under the
  rows for a manager) and per driver across the fleet
  (`/api/organizations/[orgId]/reports/trips`, managers only, scoped to
  the organisation's vehicles); both count against `fleetReport`.
- The data export lists the trips a person drove on any vehicle, without
  the company's other records.

### Write feedback (`src/lib/writeFeedback.ts`, `src/components/Toaster.tsx`, RL-034)
One toast layer, mounted in `Providers` above every page. Toasts are for
**action outcomes** (a button, a status change, a removal); `FormError`
stays for form validation, next to the field `aria-describedby` points at.
A toast never takes focus.

**Optimistic writes** go through `useOptimisticWrite()` →
`LatestWinsWriter`: the screen moves first, one request in flight, only the
latest wish queued behind it, never an automatic retry (the rate limiter
counts every attempt). A failure rolls back to the last server-confirmed
value and toasts the server's reason — its `error` sentence, which
`apiError()` builds from the `code` with any values filled in, then the
catalogue entry for the `code` (`useFailureReason()`). Used for task status, wishlist status and order,
follow and ticket vote. **Never for a gated action** — a Pro or
confirmed-address 403 must not look like it succeeded first. That is why
`TicketVoteButton` only goes optimistic with `mayVote`, which the ticket
pages compute from `isBlockedAsUnverified()`.

**Destructive actions offer Undo instead of a confirm dialog** (task,
photo, collaborator, wishlist item): `toast.undoable()` hides the thing at
once and only sends the request when the window closes, so undo needs no
restore endpoint. A page closed inside the window still commits
(`pagehide` + `keepalive`). Anything listing a row another page may be
deleting wraps it in `HideWhilePending` with the same key (`task:<id>`
etc.). `u` undoes the newest one (shortcut sheet lists it).

**Skeletons** are `loading.tsx` files, and a `loading.tsx` covers every
page nested below it — so `/dashboard` and the vehicle page live in the
`(garage)` / `(overview)` route groups to scope theirs to one page.

### The garage at a glance (`src/lib/garage.ts`, RL-035)
`/dashboard` cards come from `summarizeGarage()`, pure and fed by **two
batched queries** (every task, every owned vehicle's documents), never a query
per vehicle. The rules, tested in `garage.test.ts`:
- The headline figure is gated on `config.tracksCompletion` (percent vs open
  jobs), never on a mode name.
- Spend is null for a collaborator under `hideCostsFromCollaborators`, and a
  collaborator's card never shows a document expiry (documents are the
  owner's screen).
- "Needs attention" is an expiring/expired document or a job whose status
  tone is `warn`/`danger`, read from the config.
Filter, sort and search are one GET form, so they work without script and
the URL is shareable. Cards vs compact rows is `GarageLayout` setting
`data-density` from localStorage (guarded reads and writes); the one list
restyles through `group-data-[density=compact]/garage:` variants, so there
is no second render and no hidden duplicate list.

### First run (`src/lib/onboarding.ts`, RL-036)
A new account's dashboard explains the three modes (from
`config.description`, via the vocabulary, not hand-written copy) and shows
a four-step checklist: vehicle → job → photo → document. Steps are
**derived from the account's own rows**, never recorded as events.
`User.onboardingClosedAt` ends it for good — set by Hide or the first time
the dashboard sees every step done, and never cleared, so deleting a
vehicle doesn't bring it back. It is per account, not localStorage. The
migration closed it for every account that already owned a vehicle with a
job, and it never shows to someone who only collaborates on other people's
vehicles.

### Forms (`src/components/{AutocompleteInput,MoneyInput,PasswordInput,FormError}.tsx`)
Every RON amount goes through `MoneyInput` (decimal keypad, `min=0`,
`step=0.01`) and every error through `FormError` (`role="alert"`, with the
field's `aria-describedby` pointing at it). `autoComplete` is mandatory on
`PasswordInput` rather than optional: `current-password` vs `new-password`
is what decides whether a password manager can fill or save, and a missing
one is silent.

Autocomplete is `<datalist>`, never a constraint — no route validates
against the lists. Makes/models come from `src/lib/vehicleSuggestions.ts`
(`Record<ProjectType, ...>`, so a new mode makes `tsc` name the file);
brands and workshops come from `taskFieldSuggestions()`, scoped to the one
vehicle the caller already passed `requireVehicleAccess()` for, selecting
no cost column. `assessPassword()` is advisory only and a test pins it to
never being stricter than the server's `isPasswordStrongEnough()`.

### Keyboard shortcuts (`src/lib/shortcuts.ts`)
`g`+letter chords to navigate, single keys for actions, `?` for the sheet.
The matching is a plain module so the load-bearing parts are testable:
`isTypingTarget()` suppresses everything while the user is in a field (an
`n` firing mid-sentence in a notes box is worse than no shortcuts), a chord
prefix never doubles as a single key, and an unrecognised second key
cancels rather than falling through.

`newHrefForPath()` is shared by the `n` key and the header's + button so
they can't point at different things. `KeyboardShortcuts` is mounted in the
**root** layout and gated on the client-side session — calling
`getServerSession()` there would make `/login`, `/register` and
`/reset-password` dynamic, and they're static.

### Privacy, cookies and GDPR (`src/lib/legal.ts`, `src/lib/personalData.ts`)
`/privacy` and `/cookies` are public, and every factual claim on them comes
from `src/lib/legal.ts` — a policy that contradicts the code is worse than
none. **Add a service that receives user data and you add it to
`SUB_PROCESSORS` in the same change**; `legal.test.ts` asserts every
external host the code calls appears there. The cookie list is all
`strictlyNecessary: true`, which is what justifies a notice rather than a
consent banner — a test enforces that, and the page renders its own warning
if it ever stops being true. `NEXT_PUBLIC_PRIVACY_CONTROLLER` /
`NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` are env, not hardcoded: the deployer is
the controller.

`collectUserData()` backs `GET /api/me/export` (Art. 15/20). It deliberately
omits the password hash, Stripe ids and push endpoints — each for a reason
written at the function.

**Cascades delete rows, not bytes.** Uploads live under
`<userId>/<vehicleId>/<uuid>` in Blob or on disk, so `prisma.user.delete()`
and `prisma.vehicle.delete()` used to orphan every photo, receipt and
document. Both DELETE handlers now call `collectStorageKeys()` **before**
the delete (afterwards there's nothing left to read the keys from) and
`deleteStoredFiles()` after. Add a model with a storage key and it must go
into `collectStorageKeys()`, or its files survive an erasure request.

**Every relation to `User` states its `onDelete` explicitly**, and
`deletionRules.test.ts` reads the schema to enforce that none is `Restrict`
or `NoAction`. This is not tidiness: Prisma's default for a *required*
relation is `Restrict`, and `Task.addedBy` had no rule — so account
deletion 500'd for every user who had ever logged a task, silently, for as
long as the route existed. The route looked right; the schema refused.

**Deleting an account cancels its Personal subscription first**
(`cancelPersonalSubscriptions()`, `src/lib/accountBilling.ts`) — every
live subscription on the account's customer, at once, not at period end.
Afterwards nobody can sign in to cancel it, and Stripe would keep
charging. If Stripe cannot cancel it (down, or not configured), nothing
is deleted and the answer is 503 `subscriptionCancelFailed`. The unused
part of the period is not refunded automatically; `/terms` already says
to ask. A paying *organisation* is refused instead (`orgPayingAccount`) —
it is the company's plan to end, not one member's.

`Task.addedBy` is `SetNull` rather than `Cascade` on purpose: a mechanic
collaborator deleting their own account must not take the vehicle owner's
service history with them. `addedByUserId` is therefore nullable, meaning
"added by an account that no longer exists" — the permission checks
(`!isOwner && task.addedByUserId !== session.user.id`) fall the safe way on
null, but anything *querying* by it must not, since a null
`collaboratorUserId` also matches every pending invite.

### Admin surface (`/admin`, `src/lib/authz.ts`)
Gated by `requireAdmin()` (API) / `requireAdminOrNotFound()` (pages), both
of which **404 rather than 403** for a non-admin — the admin area doesn't
confirm its own existence to someone guessing URLs. The `/admin` layout
runs the gate too, so a child page never queries anything for a
non-admin.

**Sessions are revalidated, and that is load-bearing.** Sessions are JWTs,
so nothing is re-read from the database once a token is minted:
`User.active = false` used to block only *new* logins while the existing
token kept working for the full 30-day `maxAge`. Since deactivation is the
moderation lever behind these screens, the `jwt` callback re-reads
`active`/`isAdmin` every `REVALIDATE_AFTER_SECONDS` (60) and
`requireSession()` rejects an inactive session with 403. A ban therefore
takes effect within about a minute, not a month. Don't "optimise" that
revalidation away, and don't assume a flag on the session is fresher than
that window.

`PATCH /api/admin/users/[userId]` accepts exactly three fields — `active`,
`isProComped` and `orgBeta` (RL-038's closed beta, below) — and copies only
those onto the update rather than
merging the body, so it can't become a mass-assignment hole as `User`
grows. `isPro` and `isAdmin` stay uneditable here: the Stripe webhook owns
one and a direct database change owns the other. An admin also cannot
deactivate themselves (no in-app way back) or another admin (deposing an
admin needs the same database access as creating one).

### Pro entitlement (`src/lib/pro.ts`)
There are **two** independent sources of Pro and they have different
owners: `isPro` (paid, written only by the Stripe webhook, set false on
cancellation) and `isProComped` (complimentary, granted by an admin, which
Stripe never touches). They are separate columns precisely so a
cancellation event can't quietly revoke a comp.

**Never test either flag directly.** Ask `hasPro()`, and select the
columns with `PRO_SELECT` so a gate can't read one and miss the other —
the failure mode is a comped account with half of Pro working, which is
easy to ship and hard to notice. `proKind()` is the separate,
human-facing answer: a comped user must not be shown a billing plan they
never bought, offered a subscription to manage, or nagged to upgrade.
`pro.test.ts` covers the helpers; nothing in this repo walks a comped
account through every gate end-to-end, so when you add a gate, check it
with an account that has `isProComped` and not `isPro`.

**The founding-member promotion** (`src/lib/foundingMembers.ts`) grants the
first `FOUNDING_MEMBER_LIMIT` accounts Pro permanently, as `isProComped` —
which is exactly why that column is separate from `isPro`: a founding
member who later buys and cancels a subscription must come out of it still
comped, and the Stripe webhook sets `isPro` false on cancellation.

Allocation is **one conditional UPDATE carrying the limit**, not
`count()`-then-`create()`, or two people registering at 99 would both
become #100. It runs inside the transaction that creates the user, so a
registration that fails afterwards rolls the slot back rather than burning
one of the hundred. And it counts a persistent counter, not live users —
`count(*)` would reopen a slot on every account deletion and turn "the
first 100 users" into "the first 100 still here".

`User.foundingNumber` is unique as a last line of defence. If it ever
fires, registration **falls back to an ordinary signup rather than 500**:
a broken promotion must not stop people joining. That only happens when
the counter is out of step with the numbers already issued, which is
operator error, so it logs loudly.

Ticket triage has **no separate admin write path** — the admin screens
call the same `PATCH /api/tickets/[id]` the public detail page uses, which
already separates author edits from admin status changes.

`/admin/diagnostics` (`src/lib/diagnostics.ts`) is where a configuration
fault becomes visible without a server log: payments, storage, email, push
and the public URL, each naming the variable at fault. It reuses
`getStripe()`, `priceIdFor()`, `isStorageConfigured()`, `emailProvider()`
and `isPushConfigured()` rather than re-stating their rules — a check that
can drift out of step with the thing it checks reports health while the
feature fails. Its detail text is deliberately **not translated**: it
names environment variables and Stripe dashboard paths, which aren't
translated where the operator goes to fix them.

It also carries `foundingMemberReconciliation()`, which is the only thing
that checks the founding counter against reality. Pro arrives by three
routes and **only one of them moves that counter** — the promotion; an
admin comp and a Stripe subscription leave it alone, correctly — so the
homepage advertising "100 places left" while accounts already hold Pro is
usually right, and looks wrong to the person who owns the site. The same
read catches genuine drift (counter behind `MAX(foundingNumber)`), which
otherwise only surfaces as the unique constraint firing partway through
somebody else's signup, after the landing page has been advertising
places that were already gone.

### The pricing ladder (`src/lib/plans.ts`, RL-042 — #54)
**Free** (1 vehicle) → **Personal** (3 vehicles, 9,90/month, 99/year or
299 once) → **Pro** (10, 29,90) → **Business** (50, 99) → **Fleet** (fixed
steps: 100/250/500 vehicles at 199/349/499). Annual is ten months; only
Personal has Lifetime. Every price and allowance is in `LADDER`, and
everything that quotes one reads it — the homepage, `/demo`, `/terms`,
the upgrade page, the structured data, and the checkout (`PERSONAL_PLANS`
in `stripe.ts` takes its prices from `LADDER`; tests hold that).
- **Names.** "Pro" now means only the 10-vehicle company rung. The paid
  plan for one person is **Personal**, and that is what `hasPro()`
  answers — the function kept its name, the product did not. Copy says
  "comes with Personal", never "a Pro feature".
- **Pro, Business and Fleet are sold to organisations** (slice 3,
  `ORG_PLANS`: each rung monthly or annual, Fleet in its three steps, ten
  `STRIPE_PRICE_ORG_*` Prices). See "Organisation billing" below.
- **The retired plans** (`MONTHLY`/`ANNUAL`/`LIFETIME`) stay in the
  `ProPlan` enum for the people who hold them and have no entry in
  `PERSONAL_PLANS`, so the checkout refuses them; the webhook still accepts
  them (`isStoredPlanId`), for a checkout opened before the change.
- **Grandfathering.** The migration stamped `User.grandfatheredAt` on
  everyone holding `isPro` or `isProComped` that day, and nothing else
  writes it (a test greps for that). `isGrandfathered()` is that stamp
  *plus* still holding the old entitlement — a comp, or a paying plan that
  is not `PERSONAL_*` — and it means **Personal with no vehicle cap**.
  Someone who cancelled and later buys Personal gets today's Personal.
  `plans.test.ts` walks every group that held Pro and fails if any is
  capped. A comp granted *after* the ladder, and a founding member who
  joins after it, is Personal with its 3 vehicles — the copy promises
  "Personal free for life".
- **The allowance** is `vehicleLimit()` (null = no cap), applied by
  `refuseOverVehicleLimit()` (`vehicleAllowance.ts`) in both places a
  personal vehicle appears: creating one and moving one out of an
  organisation. Company vehicles never count. Select `PLAN_SELECT`, not
  `PRO_SELECT`, wherever the allowance is read.
- The upgrade page never sells somebody what they hold: an account with
  Personal (or grandfathered) sees what it has and the company plans.
- **Payments are held off until there is a legal entity** (#96/#97), so
  "not configured" is a normal state, not a fault. `isCheckoutReady()`
  (`stripe.ts`: a secret key *and* `STRIPE_WEBHOOK_SECRET` — without the
  webhook a card is charged and nothing granted) gates every screen that
  sells: the upgrade page shows prices marked "not on sale yet" per
  `isPersonalPlanOnSale()`, `/donate` shows a note instead of its form,
  and `isOrgBillingConfigured()` builds on it. The API routes still refuse
  with 503 on their own; the screens just stop offering a button that can
  only fail.
- **Over the allowance is read-only, never deleted** (slice 2). When an
  account holds more personal vehicles than its plan covers — a plan
  lapsed, or a comp ended — `overLimitIds()` keeps `limit` editable and
  the rest read-only: the ones the owner **chose** (`keptEditableAt`, the
  picker in settings; a manager's on the organisation page), then the
  oldest. The choice is the whole list each time (`PUT
  /api/me/editable-vehicles`, `/api/organizations/[id]/editable-vehicles`),
  capped at the allowance, cleared when a vehicle moves between garage and
  organisation, and rate-limited (`editableChoice`, 5 a day per account or
  organisation) — swapping it back and forth would edit everything a few
  vehicles at a time. Nothing is stored: it is worked out
  from the plan and the vehicles on every write, so choosing a plan,
  deleting a vehicle or moving one into an organisation undoes it at once.
  `refuseIfReadOnly()` (`vehicleAllowance.ts`) runs after the access check
  in **every** write under `/api/vehicles/[id]`, for collaborators too (it
  is the vehicle that is read-only). The ways out stay open: deleting the
  vehicle, moving it in or out of an organisation, withdrawing a passport
  link, removing a collaborator, and a PATCH whose only change is
  `isPublic: false` — privacy is never behind a plan. `readOnly.test.ts`
  walks the route tree and fails on a write handler that neither calls the
  gate nor is on that list. Reading and exporting are never gated.
- **Said before, not after**: settings lists the vehicles that would turn
  read-only if a paid plan ended, above the button that opens the Stripe
  portal where it is cancelled; the vehicle page and garage card say it
  once it happens; `/terms` (`losingPro`) says it too. Route tests that
  mock Prisma narrowly stub `refuseIfReadOnly` and point here.

### Organisation billing (RL-042 slice 3 — #54)
An organisation pays for its own plan with **its own Stripe customer**
(`Organization.stripeCustomerId`), never a member's, so the card and
invoices are the company's. `plan` is written only by the webhook, like
`User.isPro`.
- **OWNERs only** reach `/dashboard/organizations/[id]/billing`, the
  checkout and the portal routes (404/403 for anyone else) — a fleet
  manager runs the fleet and does not hold the card. The plan summary on
  the organisation page is for everyone who manages vehicles.
- **The webhook**: `checkout.session.completed` with `metadata.kind ===
  'organization'` sets the plan and returns before the personal branch, so
  it can never grant a member `isPro` (same shape as donations).
  `customer.subscription.updated` follows a plan changed in the portal by
  mapping its Price back (`orgPlanForPriceId()`; an unknown Price changes
  nothing). `customer.subscription.deleted` clears the plan.
  `invoice.payment_failed`/`succeeded` set and clear `paymentFailedAt` and
  email each OWNER. All are set-to-value writes, so a redelivery is
  harmless.
- **Allowance** is `orgVehicleLimit()`: comped → no cap; a plan → its
  vehicles; **no plan → none**. So an organisation can exist and invite
  people before it pays, but a vehicle moves in only within the plan
  (`refuseOverOrgVehicleLimit()`), and a **lapsed payment degrades to
  read-only, never hidden**: every company vehicle stays readable
  (documents, dates, history) and `refuseIfReadOnly()` refuses writes
  (`ORG_PLAN_REQUIRED`) until a plan covers them. When the plan covers only
  some, the ones a manager chose stay editable, then the oldest. Company vehicles never follow the
  account of record's plan for this.
- **Comped** (`compedAt`): the migration stamped every organisation from the
  closed beta, so none turned read-only the day billing shipped; and one a
  beta account creates while billing is not configured. An admin comps one
  or ends the comp on `/admin/organizations` (`PATCH
  /api/admin/organizations/[orgId]`, `comped` only). Comping one that pays
  is refused (`orgCompWhilePaying`) — Stripe would keep charging a company
  told it is free.
- **An organisation that pays cannot be deleted** (409 `orgHasSubscription`),
  nor an account that would take one with it (`orgPayingAccount`) — cancel
  in its portal first, or Stripe keeps charging a company nobody can reach.
- **Paid features follow the organisation** (slice 3b): `vehicleHasPro()`
  (`src/lib/entitlement.ts`) is the one question every gate on a vehicle
  asks — a personal vehicle's owner's plan, a company vehicle's
  organisation's plan (`orgHasPaidFeatures()`: comped or any company plan),
  never the caller's and never the account of record's. So a paying
  organisation gets every feature on every company vehicle whoever moved it
  in, a manager's own Personal unlocks nothing for a company that does not
  pay, and a collaborator uploading photos gets the vehicle's allowance, not
  their own. `entitlement.test.ts` fails on any file under the vehicle
  routes or screens that reads `PRO_SELECT`/`hasPro()` itself.

## What's not built yet

Phase 1 (core log) is implemented: auth, vehicle CRUD, dashboard, task CRUD,
task detail, photo upload, photo timeline, found-state intake, profile
settings, PWA install shell, workshop DIY/labour log on task.

Phase 2 is fully implemented:
- RL-011/012 wishlist / parts hunt, RL-013 document reminders (email, and Web Push since #100 —
  see above)
- RL-016 receipt attach on tasks
- RL-015 cost analytics dashboard (`src/lib/analytics.ts` +
  `/dashboard/vehicles/[id]/analytics`) — free tier gets total-spent only,
  Pro gets charts/trends/date-range filter
- RL-030–033 mechanic/specialist collaborator flow: invite/resend/revoke
  (`src/app/api/vehicles/[id]/collaborators/`), accept
  (`/collaborate/accept`), owner-only wishlist/documents/settings
  (`requireVehicleOwner`), `Vehicle.hideCostsFromCollaborators`, the
  collaborator-added-task defaults in `TaskForm`, and both PDF exports
  below
- RL-014 PDF build history export (`src/lib/pdf.ts` + `pdfBuildHistory.ts`,
  `/dashboard/vehicles/[id]/export`) — Pro-gated, pdfmake + bundled Roboto
  font for Romanian diacritics
- RL-033 job report (`src/lib/pdfJobReport.ts`,
  `/dashboard/vehicles/[id]/job-report`) — always free, reuses RL-014's PDF
  engine
- RL-017 Stripe Pro subscription (`src/lib/stripe.ts`,
  `/api/billing/checkout`, `/api/billing/portal`,
  `/api/webhooks/stripe`, `/dashboard/upgrade`) — Monthly/Annual/Lifetime,
  webhook is the only writer of `User.isPro`. Since RL-042 what it sells
  is Personal; see "The pricing ladder".

Phase 3 is fully implemented:
- RL-018 public project profile (`/builds/[username]/[slug]`,
  `src/lib/username.ts`, `src/lib/vehicleSlug.ts`) — read-only, no
  session, indexed (`src/app/robots.ts`/`sitemap.ts`); the vehicle owner's
  `hidePublicCost` toggle and the `/api/uploads/[...path]` public-vehicle
  carve-out (see pitfall #6) both live here
- RL-019 originality score (`src/lib/originality.ts`) — badge on the
  dashboard and the public profile, restoration + Pro owner only
- RL-020/021 shareable PNG cards (`src/lib/card.tsx`, `next/og`'s
  `ImageResponse`) — off-road build card and restoration before/after
  transformation card, both at `/dashboard/vehicles/[id]/card`, Pro-gated
- RL-022 community feed (`/community`) — filters/search computed and
  paginated in memory over a bounded fetch (see the page's own comment on
  why, and its scale ceiling)
- RL-023 follow a project (`Follow`/`PushSubscription` models,
  `src/lib/followNotify.ts`, `src/lib/webpush.ts`) — email always works;
  Web Push needs `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` set (DEPLOY.md "Configure Web Push") or
  it silently no-ops per subscriber
- RL-024 parts request crowdsourcing (`PartsRequest`/`PartsRequestComment`
  models, `/community/parts-wanted`) — posting is Pro-gated, replying
  isn't. The ticket's "or a direct message" isn't built — this repo has
  no messaging/inbox system to hang that on; only the comment-thread half
  ships

Phase 4 is implemented, with scope adaptations from the tickets' original
Supabase/Expo/Mapbox/RevenueCat-era wording (same kind of stack deviation
as the rest of this file — see "What this is" above):
- RL-026 price alert (`WishlistItem.targetPriceRon`, `WishlistPriceEntry`,
  `src/lib/priceAlert.ts`, `/dashboard/vehicles/[id]/wishlist/[itemId]`) —
  manual "I found it at this price" logging with a history chart,
  notifying by email/push the first time a logged price hits the target.
  Automated daily URL scraping (the ticket's literal ask) is not built —
  legally grey per the ticket's own note, and this app has no scraping
  infra — the manual flow is the lower-risk alternative the ticket itself
  suggests starting with.
- RL-028 VIN/chassis decoder (`src/lib/vinDecoder.ts`,
  `/dashboard/vehicles/[id]/vin-decoder`) — decodes a restoration
  vehicle's existing VIN via a local Dacia/Renault-Romania WMI table
  (UU1/UU2/UU6, Mioveni plant — confirmed real codes) or NHTSA's free
  vPIC API, with manual-entry fallback. Does NOT include an ARO /
  pre-standard Romanian chassis-number lookup table (no verifiable
  reference data found) or any VIN-derived colour code (no international
  standard encodes paint colour in a VIN) — both always fall to manual
  entry. Decoded spec (never the raw VIN) also shows on the public
  profile, same restoration+Pro gate as the originality score.
- RL-027 trail log (`TrailRun`/`TrailWaypoint` models,
  `src/lib/trailTrack.ts`, `/dashboard/vehicles/[id]/trail-log`) — GPS
  track recording via the browser Geolocation API, a Leaflet+OpenStreetMap
  map (no API key needed — this stack has no Mapbox key), manual
  waypoints with note/photo, localStorage crash recovery. Two disclosed
  limits: recording is foreground-only (a PWA has no "always" background
  location permission the way a native app does), and offline map-tile
  pre-download isn't built. Surfaces in the Photos tab via a
  client-rendered SVG polyline thumbnail (`TrailThumbnail.tsx`) rather
  than a captured raster map screenshot — no static-maps API key
  available to generate one.
- RL-025 (native Expo/React Native app, RevenueCat IAP, Expo push) was
  closed `not_planned` by the repo owner (GitHub issue #16) — not
  attempted. It's also a poor fit for this environment regardless: it
  needs a separate native codebase, App Store/Play Console accounts, and
  device/emulator testing this sandbox has none of.

## Pitfalls

1. **Two schemas of nothing — this repo has one Prisma schema**, unlike
   kids-heaven's dual backend/admin schemas. There is no drift to manage.

2. **`projectType` is set once at vehicle creation and never changes the
   underlying rows** — a Task's `category`/`status`/`photoType` are plain
   strings chosen from the vehicle's mode at write time. Changing a
   vehicle's `projectType` after tasks exist would orphan their vocabulary;
   the vehicle edit form does not expose it as editable. This matters more
   now there are three modes: the vocabularies don't overlap (a
   `DAILY_DRIVER` task is `BRAKES`/`DUE`, a `RESTORATION` one is
   `PAINT`/`PRIMED`), so there is no "compatible" mode to switch to.

3. **`FoundState` is 1:1 with a `Vehicle`, restoration mode only** — off-road
   vehicles never get one. Don't assume `vehicle.foundState` exists; check
   `vehicle.projectType === 'RESTORATION'` first.

4. **Collaborator access is read-mostly** — `requireVehicleAccess()` lets an
   `ACTIVE` collaborator (or a company MECHANIC/DRIVER) read the vehicle and
   its tasks, and create/edit tasks they added (`addedByUserId`), but delete
   and vehicle-settings routes must separately check
   `vehicle.access === 'owner'`. Getting this backwards is a real permission
   bug, not a style nit.

5. **Cost fields are `Decimal` in Postgres, not `Float`** — Prisma returns
   `Decimal` objects for `partsCostRon`/`labourCostRon`/etc. `NextResponse.json`
   won't throw (decimal.js defines `toJSON()`), but it serializes as a
   *string* (`"150.00"`), not a number — always run route responses through
   `serializeTask()`/`toNumberOrNull()` (`src/lib/serialize.ts`) so API
   consumers get numbers, and never do arithmetic on a raw Decimal without
   `.toNumber()` first.

6. **Uploaded photos are never served directly from `/public/uploads`** —
   always go through `/api/uploads/[...path]` so vehicle-access checks
   apply. Do not add a static rewrite that bypasses this. Since RL-018,
   that route allows unauthenticated requests for a public vehicle
   (`vehicle.isPublic`) — that's the one intentional exception; every other
   access path still requires a session + `requireVehicleAccess()`.

7. **`npx prisma generate` after every schema edit** — required before
   `npm test` or `npm run dev` will pick up new fields/models.

8. **Backend tests mock Prisma** — no live DB in `npm test` (matches
   kids-heaven backend tests). Route handlers are imported and invoked
   directly with a hand-built `NextRequest`-shaped object; see any file in
   `src/__tests__/` for the shape.

9. **`/api/cron/document-reminders` has no session** — it's a system
   endpoint, gated by `CRON_SECRET` (checked against either an
   `Authorization: Bearer` header — what Vercel Cron sends automatically —
   or `x-cron-secret`, for manual/non-Vercel callers), not
   `requireSession()`. Don't add a user-auth check to it; don't call it
   from client code either.

10. **Renewing a document is a PATCH on `expiryDate`, not a separate
    "dismiss reminder" endpoint** — there isn't one. The three
    `reminderNSentAt` fields only reset when `expiryDate` itself changes
    (`documents/[docId]/route.ts`), so a PATCH that touches other fields
    but not `expiryDate` correctly leaves them alone.

11. **`DIRECT_URL` is required, not optional** — `prisma/schema.prisma`'s
    `directUrl = env("DIRECT_URL")` throws "environment variable not
    found" from any `prisma generate`/`migrate`/`studio` command if it's
    unset, even locally where it can just repeat `DATABASE_URL` (no
    pooler in front of the docker-compose Postgres). Don't remove it to
    "simplify" local dev — that breaks the Neon/Vercel Postgres pooling
    setup DEPLOY.md depends on.

12. **`User.username`/`Vehicle.slug` (RL-018) are generated, never
    user-typed** — `src/lib/username.ts`/`src/lib/vehicleSlug.ts`. Both are
    nullable in the schema (pre-RL-018 rows can be null) and get lazily
    backfilled by `PATCH /api/vehicles/[id]` the moment a vehicle is
    switched to public — don't add a "choose your username" field without
    also handling the collision-suffix logic those helpers already do.
    `Vehicle.slug` is unique per owner (`@@unique([ownerId, slug])`), not
    globally — the owner's username in the URL is what disambiguates.

13. **Rate limiting is Postgres-backed, and new write endpoints don't get
    it for free** — `consumeRateLimit()` (`src/lib/rateLimit.ts`) must be
    called explicitly. Add the rule to `RATE_LIMITS` and wire the call, or
    the endpoint is unthrottled. Two rules when you do:
    - **Key on the user id wherever a session exists.** A session id can't
      be rotated; `x-forwarded-for` can be, by anyone, unless the app sits
      behind a proxy that overwrites it (Vercel does — a direct origin
      doesn't).
    - **An IP-keyed limit must be looser than the account-keyed limit for
      the same action.** One address can be a whole office, university or
      mobile carrier, so a tight IP budget locks out strangers who share a
      NAT. `login` (per email) is 10/15min; `loginIp` is 50/15min. There's
      a unit test asserting that ordering.

    It deliberately **fails open**: if the DB is unreachable the request is
    allowed rather than 500ing. Don't "harden" that into fail-closed
    without thinking it through — it would turn a database blip into a
    total login outage.

    Not used: an in-process counter (serverless functions don't share
    memory, so it bounds nothing once deployed) or Vercel's WAF rate
    limiting (paid-plan only, and IP-only, so it can't do the per-account
    limits). A WAF rule would be a reasonable *extra* layer on Pro, not a
    replacement.

14. **Deleting a row does not delete its file** — every upload lives in
    Vercel Blob or on disk under `<userId>/<vehicleId>/<uuid>`, and the
    Prisma cascades know nothing about it. Any handler that deletes rows
    owning a storage key must gather the keys with `collectStorageKeys()`
    *before* the delete and call `deleteStoredFiles()` after. A new model
    with a file column has to be added to `collectStorageKeys()` too, or
    its files quietly survive an account erasure.

15. **`leaflet`/`react-leaflet` (RL-027) must be loaded client-side only**
    — Leaflet touches `window` at import time, so any component that
    imports it directly throws "window is not defined" if it's ever
    reached during SSR. `TrailMap.tsx` is the one file that imports
    `leaflet`/`react-leaflet` directly; every page that needs a map wraps
    it via `next/dynamic(() => import('@/components/TrailMap'), { ssr:
    false })` (see `TrailRunMapView.tsx`, `TrailRecorder.tsx`) rather than
    importing `TrailMap` directly. Don't import `leaflet` from a Server
    Component or from a client component that isn't itself behind an
    `ssr: false` dynamic import.

16. **`User.stripeCustomerId` outlives the key that created it** — a
    Stripe customer belongs to one account *and* one mode, so every stored
    id becomes meaningless the moment `STRIPE_SECRET_KEY` is switched
    between test and live, or to another account. All three payment routes
    hand that id to Stripe, so the users who had already reached checkout
    once were exactly the ones who could never pay again — Pro and
    donations alike, since the donation route reuses the same id.
    `isMissingCustomerError()` / `forgetStripeCustomer()`
    (`src/lib/stripeCustomer.ts`) repair it optimistically: use the id,
    and only replace it if Stripe says it is missing. Anything new that
    passes `stripeCustomerId` to Stripe needs the same handling.
    Note that `resource_missing` is also how a missing *Price* reports
    itself, and the Pro checkout passes both in one call — so the check
    establishes which object Stripe meant before discarding anything.
