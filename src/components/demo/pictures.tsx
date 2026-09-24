/**
 * The drawn pictures on the tour: a car from the side and from above, a
 * photographed fuel receipt, a file.
 *
 * Drawings rather than photographs, for the reason `PhotosPreview` gives:
 * a stock photo of somebody else's car standing in for the reader's is a
 * picture of a product this is not. The lines use `currentColor`, so the
 * caller's text colour themes them. The receipt is the exception — paper
 * is white and thermal print is black in either theme, so it is painted
 * with literal values, as `ThemePreview` does.
 *
 * Every picture takes a `label`: it is `role="img"` with that as its
 * name, or hidden from the accessibility tree when it adds nothing the
 * text beside it does not already say.
 */

type PictureProps = { className?: string; label?: string }

function a11y(label?: string) {
  return label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
}

/** A hatchback in profile. */
export function CarSide({ className, label }: PictureProps) {
  return (
    <svg viewBox="0 0 160 64" className={className} {...a11y(label)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M8 46 V36 Q9 30 20 28 L44 26 L62 12 Q66 9 74 9 H108 Q116 9 122 15 L134 27 Q150 29 152 36 V46 Z" />
      <path d="M66 14 H90 V27 H50 Z" />
      <path d="M95 14 H108 Q113 14 117 18 L125 27 H95 Z" />
      <path d="M92 27 V44" />
      <circle cx="40" cy="47" r="10" className="fill-surface" />
      <circle cx="40" cy="47" r="4" />
      <circle cx="126" cy="47" r="10" className="fill-surface" />
      <circle cx="126" cy="47" r="4" />
      <path d="M150 34 h-6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * A car from above, nose at the top. With `damage`, a marked area on the
 * rear left corner — the record in the accidents preview points at it.
 */
export function CarTop({ className, label, damage = false }: PictureProps & { damage?: boolean }) {
  return (
    <svg viewBox="0 0 70 130" className={className} {...a11y(label)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <rect x="4" y="18" width="7" height="18" rx="2" fill="currentColor" />
      <rect x="59" y="18" width="7" height="18" rx="2" fill="currentColor" />
      <rect x="4" y="92" width="7" height="18" rx="2" fill="currentColor" />
      <rect x="59" y="92" width="7" height="18" rx="2" fill="currentColor" />
      <rect x="9" y="4" width="52" height="122" rx="18" className="fill-surface" />
      <path d="M16 38 Q35 30 54 38 L51 50 H19 Z" />
      <rect x="18" y="52" width="34" height="38" rx="4" />
      <path d="M19 92 H51 L54 104 Q35 110 16 104 Z" />
      {damage && (
        <g>
          <circle cx="16" cy="112" r="11" className="fill-red-500/25 stroke-red-600 dark:stroke-red-400" strokeDasharray="3 2" />
          <path d="M11 107 l10 10 M21 107 l-10 10" className="stroke-red-600 dark:stroke-red-400" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}

/**
 * A fuel receipt as a phone photographs it: slightly tilted, with the
 * three figures the scanner read boxed. The station is invented and so is
 * its fiscal code — a real chain's name on a made-up receipt would be a
 * receipt that chain never printed.
 */
export function ReceiptPicture({ className, label, date }: PictureProps & { date: string }) {
  const ink = 'rgb(28 28 30)'
  const lines: { y: number; left: string; right?: string; bold?: boolean; centre?: boolean }[] = [
    { y: 22, left: 'BENZINARIA EXEMPLU', bold: true, centre: true },
    { y: 32, left: 'CIF RO00000000', centre: true },
    { y: 42, left: 'STR. EXEMPLULUI 1', centre: true },
    { y: 60, left: `DATA ${date}`, right: '08:41' },
    { y: 76, left: 'MOTORINA STANDARD' },
    { y: 86, left: '42,31 L x 7,29', right: '308,44' },
    { y: 104, left: 'TOTAL LEI', right: '308,44', bold: true },
    { y: 116, left: 'TVA B 21%', right: '53,53' },
    { y: 128, left: 'CARD', right: '308,44' },
    { y: 150, left: 'BON FISCAL', centre: true },
  ]

  return (
    <svg viewBox="0 0 140 200" className={className} {...a11y(label)}>
      <g transform="rotate(-2 70 100)">
        {/* The zig-zag tear at the bottom is what makes it read as a receipt. */}
        <path
          d="M10 6 H130 V186 l-6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 -6 6 -6 -6 Z"
          fill="rgb(252 252 248)"
          stroke="rgb(200 200 195)"
        />
        {lines.map((line) => (
          <g key={line.y} fontFamily="ui-monospace, monospace" fontSize="7.5" fill={ink} fontWeight={line.bold ? 700 : 400}>
            <text x={line.centre ? 70 : 16} y={line.y} textAnchor={line.centre ? 'middle' : 'start'}>
              {line.left}
            </text>
            {line.right && (
              <text x={124} y={line.y} textAnchor="end">
                {line.right}
              </text>
            )}
          </g>
        ))}
        {/* What the scanner read. */}
        <g fill="rgb(42 93 140 / 0.12)" stroke="rgb(42 93 140)" strokeWidth={1.2}>
          <rect x="13" y="52" width="72" height="11" rx="2" />
          <rect x="13" y="78" width="36" height="11" rx="2" />
          <rect x="94" y="96" width="33" height="11" rx="2" />
        </g>
        {/* The station name it was not sure of. */}
        <rect x="24" y="14" width="92" height="11" rx="2" fill="rgb(217 119 6 / 0.12)" stroke="rgb(217 119 6)" strokeWidth={1.2} strokeDasharray="3 2" />
      </g>
    </svg>
  )
}

/** A document with its format written on it — CSV or PDF. */
export function FilePicture({ className, label, kind }: PictureProps & { kind: 'CSV' | 'PDF' }) {
  return (
    <svg viewBox="0 0 48 60" className={className} {...a11y(label)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M6 3 H32 L44 15 V57 H6 Z" className="fill-surface" />
      <path d="M32 3 V15 H44" />
      <path d="M13 24 H37 M13 30 H37 M13 36 H30" strokeLinecap="round" opacity={0.5} />
      <rect x="4" y="41" width="30" height="12" rx="2" fill="currentColor" stroke="none" />
      <text x="19" y="50" textAnchor="middle" fontSize="8" fontWeight={700} className="fill-surface" stroke="none">
        {kind}
      </text>
    </svg>
  )
}
