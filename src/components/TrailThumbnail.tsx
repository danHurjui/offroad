interface Point {
  lat: number
  lng: number
}

// RL-027: renders the recorded track as a lightweight inline SVG
// polyline, computed on the fly from trackGeoJson — substitutes for the
// ticket's literal "map screenshot thumbnail" ask, since this stack has
// no static-maps API key to capture a raster image from. Used on the
// trail-log list and the Photos tab's trail-runs section.
export default function TrailThumbnail({ track, className }: { track: Point[]; className?: string }) {
  if (track.length < 2) {
    return (
      <div className={`flex items-center justify-center bg-surface-subtle text-xs text-ink-faint ${className ?? ''}`}>
        No track
      </div>
    )
  }

  const lats = track.map((p) => p.lat)
  const lngs = track.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = maxLat - minLat || 1
  const lngRange = maxLng - minLng || 1
  const PADDING = 8
  const SIZE = 100

  const points = track
    .map((p) => {
      const x = PADDING + ((p.lng - minLng) / lngRange) * (SIZE - 2 * PADDING)
      // Latitude increases northward but SVG y increases downward.
      const y = PADDING + (1 - (p.lat - minLat) / latRange) * (SIZE - 2 * PADDING)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} preserveAspectRatio="none">
      <rect width={SIZE} height={SIZE} className="fill-surface-subtle" />
      <polyline points={points} fill="none" stroke="#2A5D8C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
