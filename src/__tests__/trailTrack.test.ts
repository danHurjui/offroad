import { haversineDistanceKm, computeTrackStats, activeDurationMin, type TrackPoint } from '@/lib/trailTrack'

describe('haversineDistanceKm', () => {
  it('returns ~0 for the same point', () => {
    const p: TrackPoint = { lat: 45.9432, lng: 24.9668, timestamp: 0 }
    expect(haversineDistanceKm(p, p)).toBeCloseTo(0, 5)
  })

  it('computes a known distance (Bucharest to Cluj-Napoca, ~325km great-circle)', () => {
    const bucharest: TrackPoint = { lat: 44.4268, lng: 26.1025, timestamp: 0 }
    const cluj: TrackPoint = { lat: 46.7712, lng: 23.6236, timestamp: 0 }
    const distance = haversineDistanceKm(bucharest, cluj)
    expect(distance).toBeGreaterThan(300)
    expect(distance).toBeLessThan(350)
  })
})

describe('computeTrackStats', () => {
  it('returns zero distance and null elevation for fewer than 2 points', () => {
    expect(computeTrackStats([])).toEqual({ distanceKm: 0, elevationGainM: null })
    expect(computeTrackStats([{ lat: 1, lng: 1, timestamp: 0 }])).toEqual({ distanceKm: 0, elevationGainM: null })
  })

  it('sums distance across consecutive points', () => {
    const points: TrackPoint[] = [
      { lat: 45.0, lng: 25.0, timestamp: 0 },
      { lat: 45.01, lng: 25.0, timestamp: 1000 },
      { lat: 45.02, lng: 25.0, timestamp: 2000 },
    ]
    const stats = computeTrackStats(points)
    expect(stats.distanceKm).toBeGreaterThan(0)
  })

  it('returns null elevationGainM when no point has an altitude', () => {
    const points: TrackPoint[] = [
      { lat: 45.0, lng: 25.0, timestamp: 0 },
      { lat: 45.01, lng: 25.0, timestamp: 1000 },
    ]
    expect(computeTrackStats(points).elevationGainM).toBeNull()
  })

  it('sums only positive elevation deltas (climb, not descent)', () => {
    const points: TrackPoint[] = [
      { lat: 45.0, lng: 25.0, altitude: 100, timestamp: 0 },
      { lat: 45.01, lng: 25.0, altitude: 150, timestamp: 1000 }, // +50
      { lat: 45.02, lng: 25.0, altitude: 120, timestamp: 2000 }, // -30, not counted
      { lat: 45.03, lng: 25.0, altitude: 140, timestamp: 3000 }, // +20
    ]
    expect(computeTrackStats(points).elevationGainM).toBe(70)
  })

  it('ignores altitude when only some points have it', () => {
    const points: TrackPoint[] = [
      { lat: 45.0, lng: 25.0, altitude: 100, timestamp: 0 },
      { lat: 45.01, lng: 25.0, altitude: null, timestamp: 1000 },
      { lat: 45.02, lng: 25.0, altitude: 200, timestamp: 2000 },
    ]
    // No *consecutive* pair both has altitude, so no gain is counted from
    // either edge — but this still leaves elevationGainM null since
    // hasAltitudePair never becomes true for any single step.
    expect(computeTrackStats(points).elevationGainM).toBeNull()
  })
})

describe('activeDurationMin', () => {
  it('sums closed segments', () => {
    const segments = [
      { start: 0, end: 60_000 }, // 1 min
      { start: 120_000, end: 180_000 }, // 1 min
    ]
    expect(activeDurationMin(segments)).toBe(2)
  })

  it('excludes paused time between segments', () => {
    const segments = [
      { start: 0, end: 60_000 }, // 1 min recorded
      // 10 minute pause in between, not counted
      { start: 660_000, end: 720_000 }, // 1 min recorded
    ]
    expect(activeDurationMin(segments)).toBe(2)
  })

  it('treats an open (still-recording) segment as running until `now`', () => {
    const segments = [{ start: 0, end: null }]
    expect(activeDurationMin(segments, 90_000)).toBe(2) // 1.5min rounds to 2
  })
})
