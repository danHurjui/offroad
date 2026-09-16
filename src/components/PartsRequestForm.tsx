'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { usePartConditions } from '@/lib/vocabulary'

// RL-024: parts request form — Pro-gated server-side; this component
// assumes the caller already confirmed the viewer is Pro and logged in.
import FormError from './FormError'
import AutocompleteInput from './AutocompleteInput'
import { ALL_MAKES, modelSuggestionsFor } from '@/lib/vehicleSuggestions'

export default function PartsRequestForm() {
  const t = useTranslations('parts')
  const partConditions = usePartConditions()
  const router = useRouter()
  const [form, setForm] = useState({
    vehicleMake: '',
    vehicleModel: '',
    partName: '',
    partNumber: '',
    conditionAccepted: partConditions[0].value,
    location: '',
    description: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/parts-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? t('postFailed'))
      return
    }
    const created = await res.json()
    router.push(`/community/parts-wanted/${created.id}`)
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="vehicleMake">{t('vehicleMake')}</label>
          <AutocompleteInput
            id="vehicleMake"
            value={form.vehicleMake}
            onChange={(vehicleMake) => setForm({ ...form, vehicleMake })}
            suggestions={ALL_MAKES}
            autoCapitalize="words"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="vehicleModel">{t('vehicleModel')}</label>
          <AutocompleteInput
            id="vehicleModel"
            value={form.vehicleModel}
            onChange={(vehicleModel) => setForm({ ...form, vehicleModel })}
            suggestions={modelSuggestionsFor(form.vehicleMake)}
            autoCapitalize="words"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="partName">{t('partName')}</label>
          <input
            id="partName"
            name="partName"
            className="input"
            value={form.partName}
            onChange={(e) => setForm({ ...form, partName: e.target.value })}
            placeholder={t('partNamePlaceholder')}
            autoComplete="off"
            autoCapitalize="sentences"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="partNumber">{t('partNumber')}</label>
          <input
            id="partNumber"
            name="partNumber"
            className="input font-mono"
            value={form.partNumber}
            onChange={(e) => setForm({ ...form, partNumber: e.target.value })}
            placeholder={t('partNumberPlaceholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
        <div>
          <label className="label" htmlFor="conditionAccepted">{t('conditionAccepted')}</label>
          <select id="conditionAccepted" className="input" value={form.conditionAccepted} onChange={(e) => setForm({ ...form, conditionAccepted: e.target.value })}>
            {partConditions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="location">{t('location')}</label>
          <input
            id="location"
            name="location"
            className="input"
            placeholder={t('locationPlaceholder')}
            autoComplete="address-level2"
            autoCapitalize="words"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">{t('description')}</label>
        <textarea
          id="description"
          name="description"
          className="input"
          autoCapitalize="sentences"
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? t('posting') : t('postRequest')}
      </button>
    </form>
  )
}
