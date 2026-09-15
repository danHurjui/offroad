'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet's default marker icon references image URLs that don't
// resolve correctly through a bundler — the standard workaround is to
// point it at hosted copies. This is the one piece of this component
// that needs the network (map tiles need it too); it degrades to
// invisible/broken markers offline, which is an acceptable, disclosed
// limitation for a feature that already requires a live GPS fix.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export interface MapPoint {
  lat: number
  lng: number
}

export interface MapWaypoint extends MapPoint {
  id: string
  note?: string | null
}

// RL-027: this stack has no Mapbox API key (the ticket's original ask,
// written against a Supabase/Mapbox stack) — Leaflet + OpenStreetMap
// tiles is the free, no-key substitute, same kind of stack deviation as
// this repo's other Supabase-era ticket adaptations. Loaded via
// next/dynamic with ssr:false wherever it's used, since Leaflet touches
// `window` at import time.
export default function TrailMap({
  track,
  waypoints = [],
  liveMarker,
  className,
}: {
  track: MapPoint[]
  waypoints?: MapWaypoint[]
  liveMarker?: MapPoint
  className?: string
}) {
  const center = liveMarker ?? track[track.length - 1] ?? track[0] ?? { lat: 45.9432, lng: 24.9668 } // Romania, if nothing recorded yet

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={14} scrollWheelZoom className={className ?? 'h-80 w-full rounded-lg'}>
      <RecenterOnChange center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {track.length > 1 && (
        <Polyline positions={track.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#2A5D8C', weight: 4 }} />
      )}
      {waypoints.map((w) => (
        <Marker key={w.id} position={[w.lat, w.lng]}>
          {w.note && <Popup>{w.note}</Popup>}
        </Marker>
      ))}
      {liveMarker && <Marker position={[liveMarker.lat, liveMarker.lng]} />}
    </MapContainer>
  )
}

function RecenterOnChange({ center }: { center: MapPoint }) {
  const map = useMap()
  useEffect(() => {
    map.panTo([center.lat, center.lng])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng])
  return null
}
