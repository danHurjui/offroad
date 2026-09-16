'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DecodedVin {
  manufacturer: string | null
  modelYear: number | null
  factory: string | null
  engineCode: string | null
  bodyStyle: string | null
  colorCode: string | null
}

const FIELD_LABELS: Record<keyof DecodedVin, string> = {
  manufacturer: 'Manufacturer',
  modelYear: 'Model year',
  factory: 'Factory',
  engineCode: 'Engine code',
  bodyStyle: 'Body style',
  colorCode: 'Original colour code',
}

const SOURCE_LABELS: Record<string, string> = {
  local: 'Decoded locally (Dacia/Renault-Romania VIN table)',
  nhtsa: 'Decoded via NHTSA vPIC',
  manual: 'Entered manually',
}

// RL-028: decode button + result display + manual-entry fallback form.
// colorCode is always a manual field — see the schema comment on
// Vehicle.vinDecoded for why no decode path can fill it in.
export default function VinDecoderPanel({
  vehicleId,
  vin,
  decoded: initialDecoded,
  source: initialSource,
}: {
  vehicleId: string
  vin: string | null
  decoded: DecodedVin | null
  source: string | null
}) {
  const router = useRouter()
  const [decoded, setDecoded] = useState(initialDecoded)
  const [source, setSource] = useState(initialSource)
  const [decoding, setDecoding] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<Record<keyof DecodedVin, string>>({
    manufacturer: initialDecoded?.manufacturer ?? '',
    modelYear: initialDecoded?.modelYear != null ? String(initialDecoded.modelYear) : '',
    factory: initialDecoded?.factory ?? '',
    engineCode: initialDecoded?.engineCode ?? '',
    bodyStyle: initialDecoded?.bodyStyle ?? '',
    colorCode: initialDecoded?.colorCode ?? '',
  })
  const [savingManual, setSavingManual] = useState(false)

  async function onDecode() {
    setError(null)
    setDecoding(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/vin-decode`, { method: 'POST' })
    const data = await res.json()
    setDecoding(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not decode VIN')
      return
    }
    if (data.decoded === null) {
      setShowManualForm(true)
      return
    }
    setDecoded(data.decoded)
    setSource(data.source)
    router.refresh()
  }

  async function onSaveManual(e: React.FormEvent) {
    e.preventDefault()
    setSavingManual(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/vin-decode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manual),
    })
    const data = await res.json()
    setSavingManual(false)
    if (res.ok) {
      setDecoded(data.decoded)
      setSource(data.source)
      setShowManualForm(false)
      router.refresh()
    }
  }

  if (!vin) {
    return (
      <div className="card p-4 text-sm text-ink-muted">
        Add a VIN / chassis number on this vehicle&apos;s settings page first.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div>
          <div className="text-xs text-ink-faint">VIN / chassis number</div>
          <div className="font-mono text-sm text-ink">{vin}</div>
        </div>
        <button type="button" className="btn-primary" onClick={onDecode} disabled={decoding}>
          {decoding ? 'Decoding…' : decoded ? 'Re-decode' : 'Decode VIN'}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {decoded && !showManualForm && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Decoded spec</span>
            <button type="button" className="text-xs text-brand-600 dark:text-brand-300 hover:underline" onClick={() => setShowManualForm(true)}>
              Edit manually
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {(Object.keys(FIELD_LABELS) as (keyof DecodedVin)[]).map((key) => (
              <div key={key}>
                <dt className="text-ink-faint">{FIELD_LABELS[key]}</dt>
                <dd className="text-ink">{decoded[key] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {source && <p className="mt-3 text-xs text-ink-faint">{SOURCE_LABELS[source] ?? source}</p>}
        </div>
      )}

      {showManualForm && (
        <form onSubmit={onSaveManual} className="card space-y-3 p-4">
          <p className="text-sm text-ink-muted">
            {decoded ? 'Correct or fill in any field.' : "This VIN couldn't be decoded automatically — enter what you know."}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(FIELD_LABELS) as (keyof DecodedVin)[]).map((key) => (
              <div key={key}>
                <label className="label" htmlFor={key}>{FIELD_LABELS[key]}</label>
                <input
                  id={key}
                  type={key === 'modelYear' ? 'number' : 'text'}
                  className="input"
                  value={manual[key]}
                  onChange={(e) => setManual((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={savingManual}>
            {savingManual ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  )
}
