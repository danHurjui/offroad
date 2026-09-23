'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { PROJECT_TYPES, type ProjectType } from '@/lib/projectType'
import { useAllVocabulary } from '@/lib/vocabulary'
import { compressImageIfNeeded } from '@/lib/compressImage'

// RL-002: create a vehicle / project. Project type selector is prominent —
// large buttons, not a dropdown. Driven by PROJECT_TYPE_CONFIG so a new
// mode shows up here without editing this component.
import AutocompleteInput from './AutocompleteInput'
import CoverPhotoField from './CoverPhotoField'
import FormError from './FormError'
import { MAKE_SUGGESTIONS, modelSuggestionsFor } from '@/lib/vehicleSuggestions'

/** Until a mode is picked there is nothing sensible to suggest. */
const NO_SUGGESTIONS: readonly string[] = []

export default function VehicleForm({ initialType = null }: { initialType?: ProjectType | null }) {
  const t = useTranslations('vehicleNew')
  const vocabulary = useAllVocabulary()
  const router = useRouter()
  const [projectType, setProjectType] = useState<ProjectType | null>(initialType)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [generation, setGeneration] = useState('')
  const [engine, setEngine] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!projectType) {
      setError(t('chooseType'))
      return
    }
    setLoading(true)

    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectType, make, model, year: Number(year), generation, engine }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? t('createFailed'))
      setLoading(false)
      return
    }

    if (coverFile) {
      const compressed = await compressImageIfNeeded(coverFile)
      const formData = new FormData()
      formData.append('file', compressed)
      await fetch(`/api/vehicles/${data.id}/cover-photo`, { method: 'POST', body: formData })
    }

    router.push(`/dashboard/vehicles/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label className="label">{t('projectType')}</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PROJECT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setProjectType(type)}
              aria-pressed={projectType === type}
              className={`flex flex-col justify-start rounded-xl border-2 p-4 text-left transition-colors ${
                projectType === type ? 'border-brand-500 bg-brand-50 dark:bg-brand-400/10' : 'border-surface-border'
              }`}
            >
              <div className="font-semibold text-ink">{vocabulary[type].label}</div>
              <div className="text-sm text-ink-muted">{vocabulary[type].description}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-muted">{t('modeFixed')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="make">{t('make')}</label>
          <AutocompleteInput
            id="make"
            value={make}
            onChange={setMake}
            suggestions={projectType ? MAKE_SUGGESTIONS[projectType] : NO_SUGGESTIONS}
            placeholder={t('makePlaceholder')}
            autoCapitalize="words"
            enterKeyHint="next"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="model">{t('model')}</label>
          {/* Suggestions narrow as soon as the make is recognised; an
              unknown make just leaves this a plain text field. */}
          <AutocompleteInput
            id="model"
            value={model}
            onChange={setModel}
            suggestions={modelSuggestionsFor(make)}
            placeholder={t('modelPlaceholder')}
            autoCapitalize="words"
            enterKeyHint="next"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="year">{t('year')}</label>
          <input
            id="year"
            type="number"
            className="input"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={1886}
            max={new Date().getFullYear() + 1}
            step={1}
            inputMode="numeric"
            enterKeyHint="next"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="generation">{t('generation')}</label>
          <input
            id="generation"
            name="generation"
            className="input"
            value={generation}
            onChange={(e) => setGeneration(e.target.value)}
            placeholder={t('generationPlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="engine">{t('engine')}</label>
          <input
            id="engine"
            name="engine"
            className="input"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            placeholder={t('enginePlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <CoverPhotoField file={coverFile} onFile={setCoverFile} disabled={loading} />
        </div>
      </div>

      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? t('creating') : t('create')}
      </button>
    </form>
  )
}
