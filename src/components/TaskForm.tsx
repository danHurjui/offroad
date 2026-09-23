'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { labelFor, type ProjectType } from '@/lib/projectType'
import { allowsFutureDate, isFutureDate, localIsoDate } from '@/lib/taskDate'
import { useVocabulary, useOriginalityConditions } from '@/lib/vocabulary'
import type { TaskFieldSuggestions } from '@/lib/taskSuggestions'
import Link from 'next/link'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { invoiceReadAnything, type InvoiceProposal } from '@/lib/invoiceParse'
import type { FieldState } from '@/lib/ocrText'
import type { ScanProgress } from '@/lib/ocr'
import { tryFetch } from '@/lib/writeFeedback'
import AutocompleteInput from './AutocompleteInput'
import FormError from './FormError'
import MoneyInput from './MoneyInput'
import { ScanButton, ScanFlag } from './ScanButton'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

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
  costsHidden = false,
  canScan = false,
  offerScanUpgrade = false,
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
  /** RL-031/RL-040: the viewer may not see this vehicle's costs. The amount
   * fields stay (a driver may record what they paid) but start blank and
   * no running total is shown. */
  costsHidden?: boolean
  /** RL-048: scan a service invoice into a new job — Pro (the account of record). */
  canScan?: boolean
  /** Point an owner without Pro at the upgrade page instead. */
  offerScanUpgrade?: boolean
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
  const ts = useTranslations('invoiceScan')
  const toast = useToast()
  const reasonFor = useFailureReason()
  // RL-048: the scanned invoice is attached to the job once it is saved.
  const [invoice, setInvoice] = useState<File | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scanOutcome, setScanOutcome] = useState<'read' | 'failed' | null>(null)
  const [scanTotal, setScanTotal] = useState<number | null>(null)
  const [scanStates, setScanStates] = useState<Partial<Record<'workshop' | 'money' | 'date' | 'km', FieldState>>>({})

  /**
   * Fills the form from the invoice — never saves it. What was read is
   * written in; what was read badly is cleared and flagged; the lines are
   * listed in the notes with how each was counted, so the parts/labour
   * split can be checked against the paper before adding.
   */
  async function onScanInvoice(file: File) {
    setInvoice(file)
    setScanOutcome(null)
    setScanStates({})
    setScanTotal(null)
    setScanProgress({ pass: 1, fraction: 0 })
    try {
      const { scanInvoice } = await import('@/lib/ocr')
      const p: InvoiceProposal = await scanInvoice(file, setScanProgress)
      if (!invoiceReadAnything(p)) throw new Error('nothing read')
      setWorkType('WORKSHOP')
      if (p.workshop.value !== null) setWorkshopName(p.workshop.value)
      else if (p.workshop.state === 'unsure') setWorkshopName('')
      const split = p.partsRon.state === 'read' || p.labourRon.state === 'read'
      if (split) {
        setPartsCostRon(p.partsRon.value !== null ? String(p.partsRon.value) : '')
        setLabourCostRon(p.labourRon.value !== null ? String(p.labourRon.value) : '')
      } else if (p.partsRon.state === 'unsure') {
        setPartsCostRon('')
        setLabourCostRon('')
      }
      if (p.date.value !== null) setDate(p.date.value)
      if (p.km.value !== null) setOdometerKm(String(p.km.value))
      const firstLabour = p.items.find((it) => it.kind === 'labour') ?? p.items[0]
      if (!name && firstLabour) setName(firstLabour.description)
      if (p.items.length > 0 || p.invoiceNumber.value) {
        const money = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const lines = [
          p.invoiceNumber.value ? ts('notesHeading', { number: p.invoiceNumber.value }) : ts('notesHeadingNoNumber'),
          ...p.items.map((it) => `- ${it.description}: ${money(it.amountRon)} lei (${ts(it.kind === 'labour' ? 'labour' : 'part')})`),
        ]
        setNotes((current) => (current.trim() ? `${current.trim()}\n\n` : '') + lines.join('\n'))
      }
      setScanTotal(!split && p.totalRon.value !== null ? p.totalRon.value : null)
      setScanStates({
        workshop: p.workshop.state,
        money: split ? 'read' : p.partsRon.state,
        date: p.date.state,
        km: p.km.state,
      })
      setScanOutcome('read')
    } catch {
      setScanOutcome('failed')
    } finally {
      setScanProgress(null)
    }
  }

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
    if (!res.ok) {
      setLoading(false)
      setError(data.error ?? t('saveFailed'))
      return
    }
    // The invoice goes on the job as its receipt, so a disputed figure can
    // be settled by looking at it. A refused file (over 4MB, say) says so
    // without losing the job, which is already saved.
    if (!isEdit && invoice) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(invoice))
      const up = await tryFetch(`/api/vehicles/${vehicleId}/tasks/${data.id}/receipt`, { method: 'POST', body: form })
      if (!up?.ok) toast.error(await reasonFor(up, ts('attachFailed')))
    }
    setLoading(false)

    router.push(`/dashboard/vehicles/${vehicleId}/tasks/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      {!isEdit && canScan && (
        <div>
          <ScanButton
            idle={ts('scan')}
            reading={(percent) => ts('scanning', { percent })}
            readingAgain={(percent) => ts('scanningAgain', { percent })}
            help={ts('help')}
            helpId="invoice-scan-help"
            progress={scanProgress}
            onFile={(file) => void onScanInvoice(file)}
          />
          <div aria-live="polite">
            {scanOutcome === 'read' && <p className="note-warn mt-2 rounded-lg border p-3 text-sm">{ts('read')}</p>}
            {scanOutcome === 'failed' && <p className="note-warn mt-2 rounded-lg border p-3 text-sm">{ts('failed')}</p>}
          </div>
          {invoice && <p className="mt-1 break-all text-xs text-ink-muted">{ts('attached', { name: invoice.name })}</p>}
        </div>
      )}
      {!isEdit && !canScan && offerScanUpgrade && (
        <p className="text-xs text-ink-faint">
          <Link href="/dashboard/upgrade" className="text-brand-600 hover:underline dark:text-brand-300">
            {ts('pro')}
          </Link>
        </p>
      )}
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
          {scanStates.date === 'unsure' && <ScanFlag id="date-unsure">{ts('unsureDate')}</ScanFlag>}
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
            {scanStates.km === 'unsure' && odometerKm === '' && <ScanFlag id="odometerKm-unsure">{ts('unsure')}</ScanFlag>}
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
              {scanStates.workshop === 'unsure' && workshopName === '' && <ScanFlag id="workshopName-unsure">{ts('unsure')}</ScanFlag>}
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
          {scanStates.money === 'unsure' && partsCostRon === '' && labourCostRon === '' && (
            <ScanFlag id="costs-unsure">
              {scanTotal !== null
                ? ts('noSplitWithTotal', { total: scanTotal.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) })
                : ts('noSplit')}
            </ScanFlag>
          )}
        </div>
      )}

      {costsHidden ? (
        <p className="text-xs text-ink-faint">{t('costsHiddenHint')}</p>
      ) : (
        <p className="text-sm text-ink-muted">{t('totalCost')} <span className="font-semibold text-ink">{totalCost.toLocaleString('ro-RO')} RON</span></p>
      )}

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
