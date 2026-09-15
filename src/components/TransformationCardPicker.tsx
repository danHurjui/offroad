'use client'

import { useState } from 'react'
import ShareImageButton from '@/components/ShareImageButton'

interface PhotoOption {
  id: string
  label: string
}

// RL-021: lets the owner pick which found-state ("before") and which
// progress/task ("after") photo appear on the transformation card,
// instead of only ever using the auto-picked earliest/latest.
export default function TransformationCardPicker({
  vehicleId,
  vehicleName,
  beforeOptions,
  afterOptions,
}: {
  vehicleId: string
  vehicleName: string
  beforeOptions: PhotoOption[]
  afterOptions: PhotoOption[]
}) {
  const [before, setBefore] = useState(beforeOptions[0]?.id ?? '')
  const [after, setAfter] = useState(afterOptions[0]?.id ?? '')

  const query = new URLSearchParams()
  if (before) query.set('before', before)
  if (after) query.set('after', after)
  const endpoint = `/api/vehicles/${vehicleId}/card/transformation?${query.toString()}`

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={endpoint} alt="Transformation card preview" className="w-full" />
      </div>

      <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="before-photo">Before photo</label>
          {beforeOptions.length === 0 ? (
            <p className="text-xs text-ink-faint">No found state photos yet.</p>
          ) : (
            <select id="before-photo" className="input" value={before} onChange={(e) => setBefore(e.target.value)}>
              {beforeOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="label" htmlFor="after-photo">After photo</label>
          {afterOptions.length === 0 ? (
            <p className="text-xs text-ink-faint">No task photos yet.</p>
          ) : (
            <select id="after-photo" className="input" value={after} onChange={(e) => setAfter(e.target.value)}>
              {afterOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <ShareImageButton endpoint={endpoint} fallbackName={`RigLog_${vehicleName}_transformation`} />
    </div>
  )
}
