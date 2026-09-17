'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

interface DecodedVin {
  manufacturer: string | null
  modelYear: number | null
  factory: string | null
  engineCode: string | null
  bodyStyle: string | null
  colorCode: string | null
}

/** The order the fields are shown in; the words come from the catalogue. */
const FIELDS: (keyof DecodedVin)[] = [
  'manufacturer',
  'modelYear',
  'factory',
  'engineCode',
  'bodyStyle',
  'colorCode',
]

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
  const t = useTranslations('vin')
  const tc = useTranslations('common')
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
      setError(data.error ?? t('decodeFailed'))
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
        {t('noVin')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div>
          <div className="text-xs text-ink-faint">{t('vinLabel')}</div>
          <div className="font-mono text-sm text-ink">{vin}</div>
        </div>
        <button type="button" className="btn-primary" onClick={onDecode} disabled={decoding}>
          {decoding ? t('decoding') : decoded ? t('redecode') : t('decode')}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {decoded && !showManualForm && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">{t('decodedSpec')}</span>
            <button type="button" className="text-xs text-brand-600 dark:text-brand-300 hover:underline" onClick={() => setShowManualForm(true)}>
              {t('editManually')}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {FIELDS.map((key) => (
              <div key={key}>
                <dt className="text-ink-faint">{t(`field.${key}`)}</dt>
                <dd className="text-ink">{decoded[key] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {source && (
            <p className="mt-3 text-xs text-ink-faint">
              {t.has(`source.${source}`) ? t(`source.${source}`) : source}
            </p>
          )}
        </div>
      )}

      {showManualForm && (
        <form onSubmit={onSaveManual} className="card space-y-3 p-4">
          <p className="text-sm text-ink-muted">
            {decoded ? t('correctFields') : t('couldNotDecode')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((key) => (
              <div key={key}>
                <label className="label" htmlFor={key}>
                  {t(`field.${key}`)}
                </label>
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
            {savingManual ? tc('saving') : tc('save')}
          </button>
        </form>
      )}
    </div>
  )
}
