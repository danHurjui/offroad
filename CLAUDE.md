# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RigLog — off-road build tracker & classic car restoration journal. A single
Next.js 14 (App Router) PWA. One `Vehicle` can be in `OFFROAD` or
`RESTORATION` mode; the mode is a config flag (`src/lib/projectType.ts`) that
reconfigures category taxonomy, status tags, and photo type labels — the
data model and screens are identical for both.

Infrastructure and conventions are carried over from the kids-heaven-education
admin app: Next.js App Router + Prisma (direct, no ORM-agnostic layer) +
NextAuth v4 (JWT sessions) + Postgres/Redis via docker-compose. This diverges
from the Supabase stack described in the product's original analysis doc —
see "Product docs" below.

## Product docs

The product was specced in two documents (not checked into this repo —
ask the project owner for copies if you need the originals):
- **RigLog_Analysis_Specs_v4.docx** — market analysis, product vision,
  feature spec, monetization. Written against a Supabase stack; treat its
  tech sections (5.1–5.3) as superseded by this file.
- **RigLog_Feature_Tickets_v3.docx** — RL-001…RL-033 ticket backlog with
  acceptance criteria, phased 1–4. Phase 1 (RL-001–010, RL-029) and RL-011,
  RL-012, RL-013 from Phase 2 are implemented. The rest of Phase 2–4 is
  schema-ready but not built — see "What's not built yet" below.

## Commands

```bash
# Dev
./start.sh [dev|stop|logs]
docker-compose up -d          # postgres + redis only

# Tests
npm test                                          # Jest, Prisma mocked
npm test -- --testPathPatterns=vehicles.test.ts   # single file

# Build / typecheck / lint
npm run build
npx tsc --noEmit
npm run lint

# Database
npm run db:migrate      # prisma migrate dev
npm run db:generate     # regenerate client after schema change
npm run db:seed         # dev seed data
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

`requireVehicleAccess()` returns the vehicle if the user owns it OR is an
`ACTIVE` collaborator on it, else `null`. Mutating routes additionally check
`vehicle.ownerId === session.user.id` where the ticket requires owner-only
(delete task, delete photo, change vehicle settings, invite collaborators —
see RL-031).

### Project type configuration (`src/lib/projectType.ts`)
The single source of truth for category/status-tag/photo-type vocabulary per
mode. Never hardcode a category or status string in a route or component —
import `PROJECT_TYPE_CONFIG[vehicle.projectType]` and validate against it.
This is what RL-003/RL-004/RL-006 mean by "vocabulary adapts to project type."

### Photo / file storage (`src/lib/storage.ts`)
No Supabase Storage — files are written to disk under
`UPLOADS_DIR/<userId>/<vehicleId>/...` and served from `/uploads/*`
(see `src/app/api/uploads/[...path]/route.ts`, which re-checks vehicle access
before streaming a file — the `/uploads` static path itself is not
public). Every filesystem write is wrapped in `try/catch` returning a JSON
500, per the kids-heaven filesystem-writes pitfall. This is a dev/single-node
approach; swap for S3-compatible storage before running more than one app
instance.

### Adding a route
1. Create `src/app/api/<feature>/route.ts` (or `[id]/route.ts`)
2. Start with `requireSession()`, then `requireVehicleAccess()` for anything
   under a vehicle
3. Test in `src/__tests__/<feature>.test.ts` — mock `@/lib/prisma` and
   `next-auth`, import the route's `GET`/`POST`/etc. directly (see
   `src/__tests__/vehicles.test.ts` for the pattern)

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

`POST /api/cron/document-reminders` is not wired to a scheduler — nothing
in this repo calls it. Point your platform's cron (Vercel Cron, a system
crontab, GitHub Actions) at it with an `x-cron-secret: $CRON_SECRET`
header. In-app badge (vehicle dashboard "Documents" link) and the historic-
vehicle banner (`isHistoricVehicle()`, 30+ years old → informational only,
doesn't change reminder math) are built; web push is not — only email.

## What's not built yet

Phase 1 (core log) is implemented: auth, vehicle CRUD, dashboard, task CRUD,
task detail, photo upload, photo timeline, found-state intake, profile
settings, PWA install shell, workshop DIY/labour log on task. From Phase 2:
wishlist/parts hunt (RL-011/012) and document reminders (RL-013, email only
— see above) are implemented.

Not built — schema exists, routes/UI don't (see ticket IDs for acceptance
criteria when picking these up):
- RL-014 PDF export, RL-017 Stripe payments
- RL-015 Cost analytics dashboard
- RL-018 Public project profile, RL-022 Community feed, RL-023 Follow
- RL-019 Originality score, RL-020/021 Share cards
- RL-030–033 Mechanic collaborator invite flow, job reports (the
  `ProjectCollaborator` and `Workshop` models exist; `requireVehicleAccess()`
  already accounts for collaborator access, but there is no invite UI/route)
- RL-025–028 (Phase 4): native app, price alerts, trail GPS log, VIN decoder

## Pitfalls

1. **Two schemas of nothing — this repo has one Prisma schema**, unlike
   kids-heaven's dual backend/admin schemas. There is no drift to manage.

2. **`projectType` is set once at vehicle creation and never changes the
   underlying rows** — a Task's `category`/`status`/`photoType` are plain
   strings chosen from the vehicle's mode at write time. Changing a
   vehicle's `projectType` after tasks exist would orphan their vocabulary;
   the vehicle edit form does not expose it as editable.

3. **`FoundState` is 1:1 with a `Vehicle`, restoration mode only** — off-road
   vehicles never get one. Don't assume `vehicle.foundState` exists; check
   `vehicle.projectType === 'RESTORATION'` first.

4. **Collaborator access is read-mostly** — `requireVehicleAccess()` lets an
   `ACTIVE` collaborator read the vehicle and its tasks, and create/edit
   tasks they added (`addedByUserId`), but delete and vehicle-settings
   routes must separately check `vehicle.ownerId === session.user.id`.
   Getting this backwards is a real permission bug, not a style nit.

5. **Cost fields are `Decimal` in Postgres, not `Float`** — Prisma returns
   `Decimal` objects for `partsCostRon`/`labourCostRon`/etc. `NextResponse.json`
   won't throw (decimal.js defines `toJSON()`), but it serializes as a
   *string* (`"150.00"`), not a number — always run route responses through
   `serializeTask()`/`toNumberOrNull()` (`src/lib/serialize.ts`) so API
   consumers get numbers, and never do arithmetic on a raw Decimal without
   `.toNumber()` first.

6. **Uploaded photos are never served directly from `/public/uploads`** —
   always go through `/api/uploads/[...path]` so vehicle-access checks
   apply. Do not add a static rewrite that bypasses this.

7. **`npx prisma generate` after every schema edit** — required before
   `npm test` or `npm run dev` will pick up new fields/models.

8. **Backend tests mock Prisma** — no live DB in `npm test` (matches
   kids-heaven backend tests). Route handlers are imported and invoked
   directly with a hand-built `NextRequest`-shaped object; see any file in
   `src/__tests__/` for the shape.

9. **`/api/cron/document-reminders` has no session** — it's a system
   endpoint, gated by `x-cron-secret` against `CRON_SECRET`, not
   `requireSession()`. Don't add a user-auth check to it; don't call it
   from client code either.

10. **Renewing a document is a PATCH on `expiryDate`, not a separate
    "dismiss reminder" endpoint** — there isn't one. The three
    `reminderNSentAt` fields only reset when `expiryDate` itself changes
    (`documents/[docId]/route.ts`), so a PATCH that touches other fields
    but not `expiryDate` correctly leaves them alone.
