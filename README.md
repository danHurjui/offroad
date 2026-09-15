# RigLog

Off-road build tracker & classic car restoration journal. A single Next.js 14
PWA — one vehicle, two modes (`OFFROAD` build or `RESTORATION` project) on
the same data model.

See `CLAUDE.md` for architecture notes and what's built vs. not, and
`DEPLOY.md` for a free Vercel deployment walkthrough. The product/market
spec (`RigLog_Analysis_Specs_v4.docx`) and ticket backlog
(`RigLog_Feature_Tickets_v3.docx`, RL-001…RL-033) aren't checked into this
repo — see the project owner for copies.

## Quick start (local dev)

```bash
cp .env.example .env.local   # fill in NEXTAUTH_SECRET at minimum
./start.sh                   # postgres via docker-compose, then npm run dev
npm run db:migrate           # first run only
npm run db:seed              # optional demo data
```

App runs on http://localhost:3000.

## Deploying

See `DEPLOY.md` — deploys to Vercel's free tier with a free Neon Postgres
and Vercel Blob for photo/document storage.

## Stack

Next.js 14 App Router · TypeScript · Prisma 5 · PostgreSQL 16 ·
NextAuth v4 (JWT sessions, credentials + Google OAuth) · Tailwind CSS ·
Jest.

Photos and receipts go through `src/lib/storage.ts`, which writes to local
disk in dev and Vercel Blob in production (auto-detected via
`BLOB_READ_WRITE_TOKEN`) — always behind an access-checked API route,
never a raw public URL. Not Supabase Storage — see `CLAUDE.md`.
