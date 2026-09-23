/**
 * RL-035: the garage at a glance. Everything a vehicle card shows, derived
 * in one pass over rows the dashboard fetched in two batched queries (all
 * tasks, all documents) — never a query per vehicle on the app's
 * most-visited page.
 *
 * Pure, like computeHealth(): the page renders from it and the rules are
 * tested here.
 *
 * - **"How far along" is gated on `config.tracksCompletion`**, never on a
 *   mode name. A mode that does not track completion shows its open jobs.
 * - **Spend is null for a collaborator under `hideCostsFromCollaborators`.**
 *   The route-level checks do not cover a new aggregate, so this does.
 * - **Documents are the owner's** (the documents screen is owner-only), so a
 *   collaborator's card never carries an expiry either.
 * - "Needs attention" means an expiring or expired document, or a job in a
 *   status whose tone is `warn` or `danger` (Due, Broken) — read from the
 *   config, not from a list of status names here.
 */

import { taskTotalCost, type CostTaskLike } from './analytics'
import { getDocumentStatus, type DocumentStatus } from './documents'
import { PROJECT_TYPE_CONFIG, type ProjectType } from './projectType'
import { computeVehicleProgress } from './vehicleProgress'
import type { VehicleAccess } from './access'

export const GARAGE_SORTS = ['activity', 'attention', 'name'] as const
export type GarageSort = (typeof GARAGE_SORTS)[number]

export function isGarageSort(value: unknown): value is GarageSort {
  return typeof value === 'string' && (GARAGE_SORTS as readonly string[]).includes(value)
}

export interface GarageVehicle {
  id: string
  /** The viewer's access, from src/lib/access.ts. */
  access: VehicleAccess
  projectType: ProjectType
  year: number
  make: string
  model: string
  hideCostsFromCollaborators: boolean
  updatedAt: Date
}

export interface GarageTask extends CostTaskLike {
  vehicleId: string
  status: string
  category: string
  updatedAt: Date
}

export interface GarageDocument {
  vehicleId: string
  type: string
  expiryDate: Date
}

export type GarageFigure = { kind: 'progress'; pct: number } | { kind: 'openJobs'; count: number }

export type AttentionReason = 'document' | 'job'

export interface GarageCard {
  vehicleId: string
  isOwner: boolean
  figure: GarageFigure
  /** The soonest-expiring document; null for none, and always for a collaborator. */
  soonestDocument: { type: string; expiryDate: Date; status: DocumentStatus; daysUntil: number } | null
  /** Total spent on jobs, or null when the viewer may not see it. */
  spend: number | null
  attention: AttentionReason[]
  lastActivity: Date
}

export function summarizeGarage(
  vehicles: GarageVehicle[],
  tasks: GarageTask[],
  documents: GarageDocument[],
  now: Date = new Date()
): GarageCard[] {
  const tasksBy = groupBy(tasks, (t) => t.vehicleId)
  const docsBy = groupBy(documents, (d) => d.vehicleId)

  return vehicles.map((vehicle) => {
    const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
    const own = tasksBy.get(vehicle.id) ?? []
    const isOwner = vehicle.access === 'owner'

    const figure: GarageFigure = config.tracksCompletion
      ? { kind: 'progress', pct: computeVehicleProgress(own, config.categories.length, config.completeStatus).progressPct }
      : { kind: 'openJobs', count: own.filter((t) => t.status !== config.completeStatus).length }

    const soonest = isOwner
      ? [...(docsBy.get(vehicle.id) ?? [])].sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())[0] ?? null
      : null
    const soonestDocument = soonest ? { type: soonest.type, expiryDate: soonest.expiryDate, ...getDocumentStatus(soonest.expiryDate, now) } : null

    const alarming = new Set(config.statusTags.filter((s) => s.tone === 'warn' || s.tone === 'danger').map((s) => s.value))
    const attention: AttentionReason[] = []
    if (soonestDocument && soonestDocument.status !== 'valid') attention.push('document')
    if (own.some((t) => alarming.has(t.status))) attention.push('job')

    const spend =
      isOwner || !vehicle.hideCostsFromCollaborators ? Math.round(own.reduce((s, t) => s + taskTotalCost(t), 0) * 100) / 100 : null

    const lastActivity = own.reduce((latest, t) => (t.updatedAt > latest ? t.updatedAt : latest), vehicle.updatedAt)

    return { vehicleId: vehicle.id, isOwner, figure, soonestDocument, spend, attention, lastActivity }
  })
}

/**
 * Most urgent first for `attention`: an expired document, then the fewest
 * days left, then a job that needs doing; ties by last activity.
 */
function urgency(card: GarageCard): number {
  if (card.attention.includes('document') && card.soonestDocument) return card.soonestDocument.daysUntil
  if (card.attention.includes('job')) return 1_000_000
  return Number.POSITIVE_INFINITY
}

export function sortGarage<T extends { card: GarageCard; name: string }>(items: T[], sort: GarageSort): T[] {
  const byActivity = (a: T, b: T) => b.card.lastActivity.getTime() - a.card.lastActivity.getTime()
  const copy = [...items]
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name, 'ro') || byActivity(a, b))
  if (sort === 'attention') return copy.sort((a, b) => urgency(a.card) - urgency(b.card) || byActivity(a, b))
  return copy.sort(byActivity)
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}
