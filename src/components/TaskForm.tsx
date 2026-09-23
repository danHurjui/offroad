'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { labelFor, type ProjectType } from '@/lib/projectType'
import { allowsFutureDate, isFutureDate, localIsoDate } from '@/lib/taskDate'
import { useVocabulary, useOriginalityConditions } from '@/lib/vocabulary'
import type { TaskFieldSuggestions } from '@/lib/taskSuggestions'
import AutocompleteInput from './AutocompleteInput'
import FormError from './FormError'
import MoneyInput from './MoneyInput'

interface InitialTask {
  id: string
  name: string
  brand: string | null
  category: string
  status: string
  workType: 'DIY' | 'WORKSHOP'
  costRon: number | null
  partsCostRon: number | null
  labourCostRon: number | null
  date: string
  notes: string | null
  supplierUrl: string | null
  workshopName: string | null
  workshopContact: string | null
  originalityCondition: string | null
  /** RL-044: the km of the reading logged with this job, if any. */
  odometerKm?: number | null
}

export default function TaskForm({
  vehicleId,
  projectType,
  initialTask,
  collaboratorLabel,
  suggestions,
}: {
  vehicleId: string
  projectType: ProjectType
  initialTask?: InitialTask
  /** RL-032: when a collaborator (not the owner) is adding a task, prefill
   * work type as Workshop and the workshop name with their invite label —
   * most mechanic/specialist collaborators are logging their own shop's
   * work, not DIY. Owners never get this prop. */
  collaboratorLabel?: string | null
  /** Brands and workshops already used on this vehicle — typing shortcuts
   * only, never a constraint (src/lib/taskSuggestions.ts). */
  suggestions?: TaskFieldSuggestions
}) {
  const t = useTranslations('task')
  const tc = useTranslations('common')
  const to = useTranslations('odometer')
  const router = useRouter()
  const searchParams = useSearchParams()
  const config = useVocabulary(projectType)
  const isEdit = Boolean(initialTask)

  const originalityConditions = useOriginalityConditions()
  const [name, setName] = useState(initialTask?.name ?? '')
  const [brand, setBrand] = useState(initialTask?.brand ?? '')
  const [category, setCategory] = useState(
    initialTask?.category ?? searchParams.get('category') ?? config.categories[0].value
  )
  const [status, setStatus] = useState(initialTask?.status ?? config.statusTags[0].value)
  const [workType, setWorkType] = useState<'DIY' | 'WORKSHOP'>(
    initialTask?.workType ?? (collaboratorLabel !== undefined ? 'WORKSHOP' : 'DIY')
  )
  const [costRon, setCostRon] = useState(initialTask?.costRon != null ? String(initialTask.costRon) : '')
  const [partsCostRon, setPartsCostRon] = useState(initialTask?.partsCostRon != null ? String(initialTask.partsCostRon) : '')
  const [labourCostRon, setLabourCostRon] = useState(initialTask?.labourCostRon != null ? String(initialTask.labourCostRon) : '')
  const [date, setDate] = useState(initialTask?.date ? initialTask.date.slice(0, 10) : localIsoDate())
  const [notes, setNotes] = useState(initialTask?.notes ?? '')
  const [supplierUrl, setSupplierUrl] = useState(initialTask?.supplierUrl ?? '')
  const [workshopName, setWorkshopName] = useState(initialTask?.workshopName ?? collaboratorLabel ?? '')
  const [workshopContact, setWorkshopContact] = useState(initialTask?.workshopContact ?? '')
  const [originalityCondition, setOriginalityCondition] = useState(initialTask?.originalityCondition ?? '')
  const initialKm = initialTask?.odometerKm != null ? String(initialTask.odometerKm) : ''
  const [odometerKm, setOdometerKm] = useState(initialKm)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * The date field used to carry `max={today}` for every status, which made
   * scheduling impossible: the picker simply refused the day you wanted,
   * however the status read. Only the complete status is barred now — see
   * `allowsFutureDate`.
   *
   * That one rule is enforced in `onSubmit` rather than by putting `max`
   * back for that status alone. A native constraint reports itself in the
   * *browser's* language and date format ("Value must be 09/17/2026 or
   * earlier"), so a Romanian reader would get an English bubble; and it
   * blocks before `onSubmit` runs, so the app's own message would never be
   * reached. The workshop-name rule below is handled the same way.
   */
  const canSchedule = allowsFutureDate(projectType, status)
  const dateIsFuture = isFutureDate(date)

  const totalCost =
    workType === 'WORKSHOP'
      ? (Number(partsCostRon) || 0) + (Number(labourCostRon) || 0)
      : Number(costRon) || 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (workType === 'WORKSHOP' && !workshopName) {
      setError(t('workshopNameRequired'))
      return
    }
    // Reachable by picking a future date under a scheduled status and then
    // switching the status to complete, which leaves the input's own `max`
    // out of step with what is selected.
    if (!canSchedule && dateIsFuture) {
      setError(t('dateFutureNotAllowed', { status: labelFor(config.statusTags, config.completeStatus) }))
      return
    }
    setLoading(true)

    const body = {
      name,
      brand: brand || undefined,
      category,
      status,
      workType,
      costRon: workType === 'DIY' && costRon !== '' ? Number(costRon) : undefined,
      partsCostRon: workType === 'WORKSHOP' && partsCostRon !== '' ? Number(partsCostRon) : undefined,
      labourCostRon: workType === 'WORKSHOP' && labourCostRon !== '' ? Number(labourCostRon) : undefined,
      date,
      notes: notes || undefined,
      supplierUrl: supplierUrl || undefined,
      workshopName: workType === 'WORKSHOP' ? workshopName : undefined,
      workshopContact: workType === 'WORKSHOP' ? workshopContact || undefined : undefined,
      originalityCondition: originalityCondition || undefined,
      // RL-044. Only sent when it changed, so an ordinary edit never
      // touches the mileage history; an emptied field (null) removes it.
      odometerKm: odometerKm === initialKm ? undefined : odometerKm === '' ? null : Number(odometerKm),
    }

    const url = isEdit
      ? `/api/vehicles/${vehicleId}/tasks/${initialTask!.id}`
      : `/api/vehicles/${vehicleId}/tasks`
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? t('saveFailed'))
      return
    }

    router.push(`/dashboard/vehicles/${vehicleId}/tasks/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">{t('name')}</label>
        <input
          id="name"
          name="name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={config.namePlaceholder}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="next"
          autoFocus={!isEdit}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">{t('category')}</label>
          <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {config.categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">{t('status')}</label>
          <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {config.statusTags.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">{t('date')}</label>
          <input
            id="date"
            name="date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-describedby={canSchedule && dateIsFuture ? 'date-hint' : undefined}
            required
          />
          {canSchedule && dateIsFuture && (
            // Not an error: a future date is the point of scheduling. It is
            // said out loud so a mistyped year reads as wrong immediately.
            <p id="date-hint" className="mt-1 text-sm text-ink-muted">{t('dateScheduledHint')}</p>
          )}
        </div>
        {/* RL-044: a scheduled job has not happened, so it has no reading. */}
        {!dateIsFuture && (
          <div>
            <label className="label" htmlFor="odometerKm">{to('kmLabel')}</label>
            <input
              id="odometerKm"
              name="odometerKm"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="input"
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
              aria-describedby="odometerKm-help"
            />
            <p id="odometerKm-help" className="mt-1 text-xs text-ink-faint">{to('taskKmHelp')}</p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="brand">{t('brand')}</label>
          <AutocompleteInput
            id="brand"
            value={brand}
            onChange={setBrand}
            suggestions={suggestions?.brands ?? []}
            placeholder={t('brandPlaceholder')}
          />
        </div>
      </div>

      <div>
        <label className="label">{t('workType')}</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setWorkType('DIY')}
            className={`btn ${workType === 'DIY' ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink'}`}
          >
            {t('diy')}
          </button>
          <button
            type="button"
            onClick={() => setWorkType('WORKSHOP')}
            className={`btn ${workType === 'WORKSHOP' ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink'}`}
          >
            {t('workshop')}
          </button>
        </div>
      </div>

      {workType === 'DIY' ? (
        <div>
          <label className="label" htmlFor="costRon">{t('cost')}</label>
          <MoneyInput id="costRon" value={costRon} onChange={setCostRon} />
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-surface-border p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="workshopName">{t('workshopName')}</label>
              <AutocompleteInput
                id="workshopName"
                value={workshopName}
                onChange={setWorkshopName}
                suggestions={suggestions?.workshops ?? []}
                autoCapitalize="words"
                required={workType === 'WORKSHOP'}
              />
            </div>
            <div>
              <label className="label" htmlFor="workshopContact">{t('workshopContact')}</label>
              <input
                id="workshopContact"
                name="workshopContact"
                type="tel"
                className="input"
                value={workshopContact}
                onChange={(e) => setWorkshopContact(e.target.value)}
                placeholder={t('workshopContactPlaceholder')}
                inputMode="tel"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor="partsCostRon">{t('partsCost')}</label>
              <MoneyInput id="partsCostRon" value={partsCostRon} onChange={setPartsCostRon} />
            </div>
            <div>
              <label className="label" htmlFor="labourCostRon">{t('labourCost')}</label>
              <MoneyInput id="labourCostRon" value={labourCostRon} onChange={setLabourCostRon} />
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-ink-muted">{t('totalCost')} <span className="font-semibold text-ink">{totalCost.toLocaleString('ro-RO')} RON</span></p>

      <div>
        <label className="label" htmlFor="supplierUrl">{t('supplierUrl')}</label>
        <input
          id="supplierUrl"
          name="supplierUrl"
          type="url"
          className="input"
          value={supplierUrl}
          onChange={(e) => setSupplierUrl(e.target.value)}
          placeholder="https://"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {projectType === 'RESTORATION' && (
        <div>
          <label className="label" htmlFor="originalityCondition">{t('partCondition')}</label>
          <select id="originalityCondition" className="input" value={originalityCondition} onChange={(e) => setOriginalityCondition(e.target.value)}>
            <option value="">{t('notRated')}</option>
            {originalityConditions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">{t('notes')}</label>
        <textarea id="notes" name="notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? tc('saving') : isEdit ? t('saveChanges') : t('add')}
      </button>
    </form>
  )
}
