/**
 * RL-027: pure GPS-track math, unit-testable without any browser
 * Geolocation/DOM mocking. Duration is deliberately NOT computed here —
 * it's tracked by the recorder component from its own start/pause/
 * resume/stop timestamps, since deriving it from the first/last track
 * point would incorrectly include paused time (no points are recorded
 * while paused, but wall-clock time still passes).
 */

export interface TrackPoint {
  lat: number
  lng: number
  /** Meters, or null/undefined when the device/browser didn't report one. */
  altitude?: number | null
  /** Epoch milliseconds. */
  timestamp: number
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineDistanceKm(a: TrackPoint, b: TrackPoint): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h))
}

export interface TrackStats {
  distanceKm: number
  /** Null when no consecutive pair of points both carried an altitude reading. */
  elevationGainM: number | null
}

export function computeTrackStats(points: TrackPoint[]): TrackStats {
  if (points.length < 2) return { distanceKm: 0, elevationGainM: null }

  let distanceKm = 0
  let elevationGain = 0
  let hasAltitudePair = false

  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineDistanceKm(points[i - 1], points[i])

    const prevAlt = points[i - 1].altitude
    const curAlt = points[i].altitude
    if (prevAlt != null && curAlt != null) {
      hasAltitudePair = true
      const delta = curAlt - prevAlt
      if (delta > 0) elevationGain += delta
    }
  }

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    elevationGainM: hasAltitudePair ? Math.round(elevationGain) : null,
  }
}

/** Sums the active (non-paused) time across recording segments, in minutes. */
export function activeDurationMin(segments: { start: number; end: number | null }[], now: number = Date.now()): number {
  const totalMs = segments.reduce((sum, s) => sum + ((s.end ?? now) - s.start), 0)
  return Math.round(totalMs / 60000)
}
