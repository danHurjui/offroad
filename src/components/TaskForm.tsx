'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { type ProjectType } from '@/lib/projectType'
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
  const [date, setDate] = useState(initialTask?.date ? initialTask.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState(initialTask?.notes ?? '')
  const [supplierUrl, setSupplierUrl] = useState(initialTask?.supplierUrl ?? '')
  const [workshopName, setWorkshopName] = useState(initialTask?.workshopName ?? collaboratorLabel ?? '')
  const [workshopContact, setWorkshopContact] = useState(initialTask?.workshopContact ?? '')
  const [originalityCondition, setOriginalityCondition] = useState(initialTask?.originalityCondition ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
            // A job can't have been done tomorrow; a future date here is
            // always a typo, and it skews every cost-over-time chart.
            max={new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
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
