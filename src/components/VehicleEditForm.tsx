'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import AutocompleteInput from './AutocompleteInput'
import CoverPhotoField, { type CoverCandidate } from './CoverPhotoField'
import FormError from './FormError'
import RegistrationFields, { registrationValuesFrom, type RegistrationValues } from './RegistrationFields'
import ValuesFields, { valuesFrom, valuesPayload, type ValuesValues } from './ValuesFields'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { MAKE_SUGGESTIONS, modelSuggestionsFor } from '@/lib/vehicleSuggestions'
import type { ProjectType } from '@/lib/projectType'

interface Vehicle {
  id: string
  // Not editable (pitfall #2 — it would orphan every task's vocabulary);
  // it is here only to pick the right make suggestions.
  projectType: ProjectType
  make: string
  model: string
  year: number
  generation: string | null
  engine: string | null
  vin: string | null
  coverPhotoUrl: string | null
  isPublic: boolean
  /** RL-038: the organisation it belongs to; a company vehicle is never public. */
  companyName: string | null
  hideCostsFromCollaborators: boolean
  hidePublicCost: boolean
  slug: string | null
  ownerUsername: string | null
  plate: string | null
  firstRegistrationDate: string | null
  fuelType: string | null
  transmission: string | null
  engineCapacityCc: number | null
  powerKw: number | null
  colour: string | null
  seats: number | null
  purchaseDate: string | null
  purchasePriceRon: number | null
  currentValueRon: number | null
  currentValueAt: string | null
  financeType: string | null
  financeMonthlyRon: number | null
  financeStartDate: string | null
  financeEndDate: string | null
}

export default function VehicleEditForm({
  vehicle,
  coverCandidates = [],
}: {
  vehicle: Vehicle
  coverCandidates?: CoverCandidate[]
}) {
  const t = useTranslations('vehicleEdit')
  const tc = useTranslations('common')
  const tCover = useTranslations('cover')
  const router = useRouter()
  const [form, setForm] = useState({
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    generation: vehicle.generation ?? '',
    engine: vehicle.engine ?? '',
    vin: vehicle.vin ?? '',
    isPublic: vehicle.isPublic,
    hideCostsFromCollaborators: vehicle.hideCostsFromCollaborators,
    hidePublicCost: vehicle.hidePublicCost,
  })
  const [registration, setRegistration] = useState<RegistrationValues>(() => registrationValuesFrom(vehicle))
  const [values, setValues] = useState<ValuesValues>(() => valuesFrom(vehicle))
  const publicUrl = vehicle.ownerUsername && vehicle.slug ? `/builds/${vehicle.ownerUsername}/${vehicle.slug}` : null
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // The cover could previously only be set while creating the vehicle, and
  // was shown nowhere afterwards — so a vehicle added without one could
  // never get one, and one added with the wrong photo kept it.
  const [coverUrl, setCoverUrl] = useState(vehicle.coverPhotoUrl)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [removingCover, setRemovingCover] = useState(false)

  async function onRemoveCover() {
    setError(null)
    setRemovingCover(true)
    const res = await fetch(`/api/vehicles/${vehicle.id}/cover-photo`, { method: 'DELETE' })
    setRemovingCover(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? tCover('removeFailed'))
      return
    }
    setCoverUrl(null)
    router.refresh()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch(`/api/vehicles/${vehicle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...registration, ...valuesPayload(values), year: Number(form.year) }),
    })
    if (!res.ok) {
      setLoading(false)
      const data = await res.json()
      setError(data.error ?? t('saveFailed'))
      return
    }

    // After the field save, so a rejected cover (over the 4MB ceiling, say)
    // reports itself rather than silently losing the rest of the edit.
    if (coverFile) {
      const formData = new FormData()
      formData.append('file', await compressImageIfNeeded(coverFile))
      const coverRes = await fetch(`/api/vehicles/${vehicle.id}/cover-photo`, { method: 'POST', body: formData })
      if (!coverRes.ok) {
        setLoading(false)
        const data = await coverRes.json().catch(() => null)
        setError(data?.error ?? tCover('uploadFailed'))
        return
      }
    }

    setLoading(false)
    router.push(`/dashboard/vehicles/${vehicle.id}`)
    router.refresh()
  }

  async function onDelete() {
    if (!confirm(t('confirmDelete'))) return
    setDeleting(true)
    await fetch(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="make">{t('make')}</label>
            <AutocompleteInput
              id="make"
              value={form.make}
              onChange={(make) => setForm({ ...form, make })}
              suggestions={MAKE_SUGGESTIONS[vehicle.projectType]}
              autoCapitalize="words"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="model">{t('model')}</label>
            <AutocompleteInput
              id="model"
              value={form.model}
              onChange={(model) => setForm({ ...form, model })}
              suggestions={modelSuggestionsFor(form.make)}
              autoCapitalize="words"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="year">{t('year')}</label>
            <input
              id="year"
              name="year"
              type="number"
              className="input"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              min={1886}
              max={new Date().getFullYear() + 1}
              step={1}
              inputMode="numeric"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="generation">{t('generation')}</label>
            <input
              id="generation"
              name="generation"
              className="input"
              value={form.generation}
              onChange={(e) => setForm({ ...form, generation: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="engine">{t('engine')}</label>
            <input
              id="engine"
              name="engine"
              className="input"
              value={form.engine}
              onChange={(e) => setForm({ ...form, engine: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="vin">{t('vin')}</label>
            {/* VINs are 17 uppercase alphanumerics with no I/O/Q; uppercasing
                as you type saves a round of "why won't it decode?". */}
            <input
              id="vin"
              name="vin"
              className="input font-mono uppercase"
              value={form.vin}
              onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
              maxLength={17}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
        </div>

        <RegistrationFields values={registration} onChange={setRegistration} />

        <ValuesFields values={values} onChange={setValues} currentValueAt={vehicle.currentValueAt} />

        <CoverPhotoField
          currentUrl={coverUrl}
          file={coverFile}
          onFile={setCoverFile}
          onRemove={onRemoveCover}
          removing={removingCover}
          disabled={loading}
          photos={coverCandidates}
        />

        {vehicle.companyName ? (
          <p className="text-xs text-ink-muted">{t('companyNotPublic', { name: vehicle.companyName })}</p>
        ) : (
          <>
            <div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                />
                {t('makePublic')}
              </label>
              {form.isPublic && (
                <p className="mt-1 pl-6 text-xs text-ink-faint">
                  {publicUrl ? (
                    <>
                      {t('liveAt')} <span className="font-mono">{publicUrl}</span>
                    </>
                  ) : (
                    t('urlOnSave')
                  )}
                </p>
              )}
            </div>

            {form.isPublic && (
              <label className="flex items-center gap-2 pl-6 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.hidePublicCost}
                  onChange={(e) => setForm({ ...form, hidePublicCost: e.target.checked })}
                />
                {t('hidePublicCost')}
              </label>
            )}
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.hideCostsFromCollaborators}
            onChange={(e) => setForm({ ...form, hideCostsFromCollaborators: e.target.checked })}
          />
          {t('hideCostsFromCollaborators')}
        </label>

        <FormError>{error}</FormError>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? tc('saving') : t('saveChanges')}
        </button>
      </form>

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-ink">{t('dangerZone')}</h2>
        <p className="mb-3 text-sm text-ink-muted">
          {t('deleteHelp')}
        </p>
        <button type="button" className="btn-danger" onClick={onDelete} disabled={deleting}>
          {deleting ? tc('deleting') : t('deleteVehicle')}
        </button>
      </div>
    </div>
  )
}
