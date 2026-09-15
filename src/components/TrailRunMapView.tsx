'use client'

import dynamic from 'next/dynamic'
import type { MapPoint, MapWaypoint } from '@/components/TrailMap'

// Leaflet touches `window` at import time, so the map itself can only
// ever load client-side — this thin wrapper is what lets the (server)
// trail-run detail page render it via next/dynamic's ssr:false.
const TrailMap = dynamic(() => import('@/components/TrailMap'), { ssr: false })

export default function TrailRunMapView({ track, waypoints }: { track: MapPoint[]; waypoints: MapWaypoint[] }) {
  return <TrailMap track={track} waypoints={waypoints} />
}
