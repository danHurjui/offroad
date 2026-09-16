/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = [
  "'self'",
  "'unsafe-inline'", // TODO: replace with per-request nonce (tracked as follow-up)
  ...(isDev ? ["'unsafe-eval'"] : []), // Next.js HMR needs unsafe-eval in dev only
  'https://accounts.google.com',
].join(' ');

const connectSrc = [
  "'self'",
  'https://accounts.google.com',
  'https:',
].join(' ');

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-src 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig = {
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

export default nextConfig;
