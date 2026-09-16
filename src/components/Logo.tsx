/**
 * The RigLog mark: a road running to the horizon across a globe.
 *
 * Inline SVG rather than `<img src="/logo-mark.svg">` for two reasons —
 * it inherits `currentColor`, so the header's `text-brand-600
 * dark:text-brand-300` themes it for free, and it costs no extra request
 * on a cold load.
 *
 * The road's centre markings are holes punched through the road with
 * `fill-rule="evenodd"`, not white shapes painted on top. White would only
 * be right on a white page; a hole is right on any background, which is
 * what a mark used on a light header, a dark header and a brand tile
 * needs.
 *
 * `public/logo-mark.svg` and `public/logo.svg` are the same artwork for
 * use outside the app (README, social cards). Change one, change those.
 */
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden focusable="false">
      <defs>
        {/* Stops the road at the horizon instead of running off the box. */}
        <clipPath id="riglog-globe">
          <circle cx="256" cy="256" r="186" />
        </clipPath>
      </defs>

      <g fill="none" stroke="currentColor">
        <circle cx="256" cy="256" r="186" strokeWidth="26" />
        {/* Grid at half strength so the road stays the subject. The third
            meridian is what keeps this from reading as a flat cross. */}
        <g transform="translate(256 256)" strokeWidth="20" opacity="0.45">
          <line x1="-186" y1="0" x2="186" y2="0" />
          <ellipse rx="88" ry="186" />
          <ellipse rx="160" ry="186" />
          <ellipse rx="186" ry="104" />
        </g>
      </g>

      <g clipPath="url(#riglog-globe)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M 176 460 L 244 168 L 268 168 L 336 460 Z
             M 248 380 h 16 v 58 h -16 Z
             M 249.5 306 h 13 v 50 h -13 Z
             M 250.5 244 h 11 v 42 h -11 Z
             M 252 198 h 8 v 30 h -8 Z"
        />
      </g>
    </svg>
  )
}

/**
 * Mark plus wordmark, for the app headers.
 *
 * The wordmark is HTML text, not SVG text: the app has no webfont loaded
 * (tailwind.config.ts names Inter but nothing fetches it, so this renders
 * in system-ui), and real text stays selectable, scales with the user's
 * font size, and is read aloud correctly. An SVG `<text>` would silently
 * fall back to whatever font the viewer happens to have.
 */
export default function Logo({
  className = '',
  markClassName = 'h-7 w-7',
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-bold tracking-tight">RigLog</span>
    </span>
  )
}
