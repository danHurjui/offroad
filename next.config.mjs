import createNextIntlPlugin from 'next-intl/plugin';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Build identity, resolved here and nowhere else.
 *
 * These become `process.env.NEXT_PUBLIC_*` substitutions at build time,
 * which is the whole point: the version has to describe the **bundle the
 * person is running**, not the server that answered them. A value read at
 * request time would report the current deploy to somebody whose browser
 * is still serving them a cached one from last week — which is precisely
 * the case this feature exists to catch.
 *
 * Every resolver below falls to null rather than to a guess. A version
 * string gets quoted back as fact in a bug report, so "unknown" is the
 * only honest thing to print when we do not know.
 */
function buildSha() {
  // Vercel sets this at build; it is the deploy's real commit and does not
  // need git to be present in the image.
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // No git, a tarball export, a shallow checkout without history. Not an
    // error — the build must not fail over a label.
    return '';
  }
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? '';
  } catch {
    return '';
  }
}

const buildInfo = {
  NEXT_PUBLIC_APP_VERSION: packageVersion(),
  NEXT_PUBLIC_BUILD_SHA: buildSha(),
  NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
};

// Points next-intl at the per-request language resolution. There is no
// `[locale]` segment — the locale comes from a cookie; see
// src/i18n/config.ts for why.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = [
  "'self'",
  // 'unsafe-inline' is kept deliberately (#115). Dropping it in the App
  // Router means a per-request nonce set from middleware, which Next only
  // honours by opting every page out of static rendering — and this app
  // keeps its marketing/auth/public pages static on purpose (see
  // src/i18n/config.ts and "There is no middleware" in CLAUDE.md). The
  // nonce migration is tracked as a follow-up on #115; the rest of the CSP
  // (no wildcard connect-src, object-src 'none', base-uri/form-action
  // 'self') is tightened below so this is not the only line of defence.
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []), // Next.js HMR needs unsafe-eval in dev only
  // RL-048: the receipt reader compiles its WebAssembly engine in the
  // browser. This allows compiling WebAssembly only — not eval of JS.
  "'wasm-unsafe-eval'",
  'https://accounts.google.com',
  // Cloudflare Turnstile. The widget's script comes from here and it
  // draws its challenge in an iframe from the same origin, so both
  // script-src and the frame-src below need it — a policy that allows
  // only the script leaves a widget that loads and then renders nothing,
  // with the reason buried in the console.
  'https://challenges.cloudflare.com',
].join(' ');

// Every browser fetch/XHR/websocket the app makes is same-origin (the API,
// the OCR models under /ocr, feedback and push subscription all POST to
// /api). Google OAuth is a full-page redirect to accounts.google.com, which
// navigation — not connect-src — governs, but it is kept here for the token
// endpoints the sign-in flow can call. Turnstile talks to Cloudflare from
// inside its own iframe (frame-src), not from this document. So the broad
// `https:` wildcard was allowing exfiltration to any host for no functional
// gain (#115) — narrowed to the origins actually used.
const connectSrc = [
  "'self'",
  'https://accounts.google.com',
].join(' ');

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  // RL-048: the receipt reader's worker is a same-origin file
  // (public/ocr/worker.min.js), never a blob: URL — see src/lib/ocr.ts.
  "worker-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-src 'self' https://accounts.google.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  // Nothing here embeds a plugin; a stray <object>/<embed> is only ever an
  // injection vector (#115).
  "object-src 'none'",
  // Lock the document base so an injected <base> can't repoint every
  // relative script/style/link at an attacker's origin (#115).
  "base-uri 'self'",
  // Forms only ever post back to this origin (auth, the feedback board,
  // Stripe checkout is a redirect, not a form post to Stripe).
  "form-action 'self'",
].join('; ');

const nextConfig = {
  // Inlined into the bundle at build time — see buildInfo above for why
  // that timing is the requirement rather than a convenience.
  env: buildInfo,
  // No `output: 'standalone'` — that's for a self-managed Docker/Node
  // deployment. Vercel does its own build tracing and explicitly
  // recommends against standalone output on its platform.
  eslint: { ignoreDuringBuilds: true },
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  experimental: {
    // RL-014/RL-033: the PDF export routes (src/lib/pdf.ts) read Roboto
    // .ttf files from /fonts at runtime via fs, not an import — Vercel's
    // build-time file tracer can't see that reference on its own, so the
    // font files would be missing from the deployed function without this.
    outputFileTracingIncludes: {
      '/api/**/*': ['./fonts/**/*'],
    },
  },
  async rewrites() {
    return [
      // Next reserves src/app/sitemap.ts for the XML file, so the readable
      // site map cannot live at src/app/sitemap/page.tsx — the two collide
      // on the same path. It is served from /sitemap-page and rewritten
      // here, so the address people see and link to is /sitemap.
      { source: '/sitemap', destination: '/sitemap-page' },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
