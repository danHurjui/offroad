'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { computeTrackStats, activeDurationMin, type TrackPoint } from '@/lib/trailTrack'

const TrailMap = dynamic(() => import('@/components/TrailMap'), { ssr: false })

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

interface Segment {
  start: number
  end: number | null
}

interface LocalWaypoint {
  lat: number
  lng: number
  note: string
  recordedAt: number
  photoFile: File | null
}

function storageKey(vehicleId: string): string {
  return `riglog-trail-recording-${vehicleId}`
}

interface PersistedRecording {
  segments: Segment[]
  track: TrackPoint[]
  // photoFile can't survive localStorage — a recovered waypoint just has no pending photo.
  waypoints: Omit<LocalWaypoint, 'photoFile'>[]
}

// RL-027: start/pause/stop GPS recording via the browser Geolocation
// API. This is foreground-only — a PWA has no "always" background
// location permission the way a native app does (see issue #18's own
// note), so recording stops if the tab is backgrounded or closed. That
// limitation is disclosed in the UI below rather than silently losing
// data; localStorage persistence (best-effort, wrapped in try/catch) at
// least survives an accidental reload of the same tab.
export default function TrailRecorder({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('trail')
  const tc = useTranslations('common')
  const router = useRouter()
  const [state, setState] = useState<RecordingState>('idle')
  const [segments, setSegments] = useState<Segment[]>([])
  const [track, setTrack] = useState<TrackPoint[]>([])
  const [waypoints, setWaypoints] = useState<LocalWaypoint[]>([])
  const [liveMarker, setLiveMarker] = useState<{ lat: number; lng: number } | undefined>()
  const [geoError, setGeoError] = useState<string | null>(null)
  const [waypointNote, setWaypointNote] = useState('')
  const [waypointPhoto, setWaypointPhoto] = useState<File | null>(null)
  const [recoverable, setRecoverable] = useState<PersistedRecording | null>(null)

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(vehicleId))
      if (raw) setRecoverable(JSON.parse(raw))
    } catch {
      // Private browsing / cleared storage — nothing to recover, not an error.
    }
  }, [vehicleId])

  function persist(nextSegments: Segment[], nextTrack: TrackPoint[], nextWaypoints: LocalWaypoint[]) {
    try {
      const data: PersistedRecording = {
        segments: nextSegments,
        track: nextTrack,
        waypoints: nextWaypoints.map(({ photoFile: _photoFile, ...w }) => w),
      }
      localStorage.setItem(storageKey(vehicleId), JSON.stringify(data))
    } catch {
      // Best-effort only.
    }
  }

  function clearPersisted() {
    try {
      localStorage.removeItem(storageKey(vehicleId))
    } catch {
      // Nothing to do.
    }
  }

  function watchPosition() {
    if (!('geolocation' in navigator)) {
      setGeoError(t('geoUnavailable'))
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null)
        const point: TrackPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        }
        setLiveMarker({ lat: point.lat, lng: point.lng })
        setTrack((prev) => {
          const next = [...prev, point]
          persist(segments, next, waypoints)
          return next
        })
      },
      () => setGeoError(t('geoDenied')),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  function stopWatching() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  function start() {
    const initial: Segment[] = [{ start: Date.now(), end: null }]
    setSegments(initial)
    setTrack([])
    setWaypoints([])
    setState('recording')
    watchPosition()
  }

  function pause() {
    stopWatching()
    setSegments((prev) => {
      const next = prev.map((s, i) => (i === prev.length - 1 ? { ...s, end: Date.now() } : s))
      persist(next, track, waypoints)
      return next
    })
    setState('paused')
  }

  function resume() {
    setSegments((prev) => [...prev, { start: Date.now(), end: null }])
    setState('recording')
    watchPosition()
  }

  function stop() {
    stopWatching()
    setSegments((prev) => {
      const next = prev[prev.length - 1]?.end == null ? prev.map((s, i) => (i === prev.length - 1 ? { ...s, end: Date.now() } : s)) : prev
      persist(next, track, waypoints)
      return next
    })
    setName(`Trail run — ${new Date().toLocaleDateString('ro-RO')}`)
    setState('stopped')
  }

  function dropWaypoint() {
    if (!liveMarker) return
    const waypoint: LocalWaypoint = {
      lat: liveMarker.lat,
      lng: liveMarker.lng,
      note: waypointNote,
      recordedAt: Date.now(),
      photoFile: waypointPhoto,
    }
    setWaypoints((prev) => {
      const next = [...prev, waypoint]
      persist(segments, track, next)
      return next
    })
    setWaypointNote('')
    setWaypointPhoto(null)
  }

  function resumeRecovered() {
    if (!recoverable) return
    setSegments(recoverable.segments)
    setTrack(recoverable.track)
    setWaypoints(recoverable.waypoints.map((w) => ({ ...w, photoFile: null })))
    setRecoverable(null)
    setState('paused')
  }

  function discardRecovered() {
    clearPersisted()
    setRecoverable(null)
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaving(true)

    const stats = computeTrackStats(track)
    const durationMin = activeDurationMin(segments)

    const res = await fetch(`/api/vehicles/${vehicleId}/trail-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        date: new Date().toISOString(),
        location: location || undefined,
        notes: notes || undefined,
        distanceKm: stats.distanceKm,
        durationMin,
        elevationGainM: stats.elevationGainM,
        trackGeoJson: track,
        waypoints: waypoints.map((w) => ({ lat: w.lat, lng: w.lng, note: w.note || undefined, recordedAt: new Date(w.recordedAt).toISOString() })),
      }),
    })
    const run = await res.json()
    if (!res.ok) {
      setSaving(false)
      setSaveError(run.error ?? t('saveFailed'))
      return
    }

    // Match returned waypoint rows back to local ones (with pending
    // photos) by recordedAt — both lists sorted the same way, and each
    // recordedAt is a distinct millisecond timestamp from a real button
    // press, so this pairing is reliable in practice.
    const sortedReturned = [...run.waypoints].sort(
      (a: { recordedAt: string }, b: { recordedAt: string }) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    )
    const sortedLocal = [...waypoints].sort((a, b) => a.recordedAt - b.recordedAt)
    await Promise.all(
      sortedLocal.map(async (local, i) => {
        if (!local.photoFile) return
        const returned = sortedReturned[i]
        if (!returned) return
        const formData = new FormData()
        formData.append('file', local.photoFile)
        await fetch(`/api/vehicles/${vehicleId}/trail-runs/${run.id}/waypoints/${returned.id}/photo`, {
          method: 'POST',
          body: formData,
        }).catch(() => {})
      })
    )

    clearPersisted()
    setSaving(false)
    router.push(`/dashboard/vehicles/${vehicleId}/trail-log/${run.id}`)
    router.refresh()
  }

  if (recoverable) {
    return (
      <div className="card space-y-3 p-4">
        <p className="text-sm text-ink">
          {t('recovered', {
            points: recoverable.track.length,
            waypoints: recoverable.waypoints.length,
          })}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={resumeRecovered}>
            {t('resumeIt')}
          </button>
          <button type="button" className="btn-danger" onClick={discardRecovered}>
            {t('discard')}
          </button>
        </div>
      </div>
    )
  }

  if (state === 'stopped') {
    const stats = computeTrackStats(track)
    return (
      <form onSubmit={onSave} className="card space-y-4 p-6">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-ink-faint">{t('distance')}</div><div className="font-semibold text-ink">{stats.distanceKm} km</div></div>
          <div><div className="text-xs text-ink-faint">{t('duration')}</div><div className="font-semibold text-ink">{activeDurationMin(segments)} min</div></div>
          <div><div className="text-xs text-ink-faint">{t('elevationGain')}</div><div className="font-semibold text-ink">{stats.elevationGainM != null ? `${stats.elevationGainM} m` : '—'}</div></div>
        </div>
        <div>
          <label className="label" htmlFor="name">{t('name')}</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="location">{t('location')}</label>
          <input id="location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="notes">{t('notes')}</label>
          <textarea id="notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? tc('saving') : t('saveRun')}
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border note-warn p-3 text-xs text-amber-800 dark:text-amber-300">
        {t('foregroundWarning')}
      </p>

      <TrailMap track={track} liveMarker={liveMarker} />
      {geoError && <p className="text-sm text-red-600 dark:text-red-400">{geoError}</p>}

      <div className="flex flex-wrap gap-2">
        {state === 'idle' && <button type="button" className="btn-primary" onClick={start}>
            {t('startRecording')}
          </button>}
        {state === 'recording' && (
          <>
            <button type="button" className="btn-secondary" onClick={pause}>
              {t('pause')}
            </button>
            <button type="button" className="btn-danger" onClick={stop}>
              {t('stop')}
            </button>
          </>
        )}
        {state === 'paused' && (
          <>
            <button type="button" className="btn-primary" onClick={resume}>
              {t('resume')}
            </button>
            <button type="button" className="btn-danger" onClick={stop}>
              {t('stop')}
            </button>
          </>
        )}
      </div>

      {state !== 'idle' && (
        <div className="card space-y-2 p-4">
          <div className="text-sm font-medium text-ink-muted">{t('dropWaypoint')}</div>
          <input
            type="text"
            className="input"
            placeholder={t('notePlaceholder')}
            value={waypointNote}
            onChange={(e) => setWaypointNote(e.target.value)}
          />
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setWaypointPhoto(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn-secondary" onClick={dropWaypoint} disabled={!liveMarker}>
            {t('dropHere')}
          </button>
          {waypoints.length > 0 && <p className="text-xs text-ink-faint">{t('waypointsDropped', { count: waypoints.length })}</p>}
        </div>
      )}
    </div>
  )
}
