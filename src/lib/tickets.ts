/**
 * Vocabulary and validation for the public feedback board. Same pattern as
 * src/lib/projectType.ts: the config below is the single source of truth,
 * and the type guards derive from it so a new type/status can't be added
 * here while a route still rejects it.
 */

export type TicketType = 'BUG' | 'FEATURE' | 'IMPROVEMENT'
export type TicketStatus = 'OPEN' | 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'DECLINED' | 'DUPLICATE'

export type TicketTypeConfig = { label: string; blurb: string; badgeClass: string }
export type TicketStatusConfig = { label: string; badgeClass: string; open: boolean }

export const TICKET_TYPES: Record<TicketType, TicketTypeConfig> = {
  BUG: {
    label: 'Bug',
    blurb: 'Something is broken or behaving wrongly',
    badgeClass: 'badge-danger',
  },
  FEATURE: {
    label: 'Feature request',
    blurb: "Something RigLog doesn't do yet",
    badgeClass: 'badge-brand',
  },
  IMPROVEMENT: {
    label: 'Improvement',
    blurb: 'Something that exists but could work better',
    badgeClass: 'badge-warn',
  },
}

export const TICKET_STATUSES: Record<TicketStatus, TicketStatusConfig> = {
  OPEN: { label: 'Open', badgeClass: 'bg-surface-subtle text-ink-muted', open: true },
  PLANNED: { label: 'Planned', badgeClass: 'badge-brand', open: true },
  IN_PROGRESS: { label: 'In progress', badgeClass: 'badge-warn', open: true },
  DONE: { label: 'Done', badgeClass: 'badge-success', open: false },
  DECLINED: { label: 'Declined', badgeClass: 'bg-surface-subtle text-ink-faint', open: false },
  DUPLICATE: { label: 'Duplicate', badgeClass: 'bg-surface-subtle text-ink-faint', open: false },
}

export const TICKET_TYPE_VALUES = Object.keys(TICKET_TYPES) as TicketType[]
export const TICKET_STATUS_VALUES = Object.keys(TICKET_STATUSES) as TicketStatus[]

export function isTicketType(value: unknown): value is TicketType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TICKET_TYPES, value)
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TICKET_STATUSES, value)
}

export const TICKET_TITLE_MAX = 120
export const TICKET_DESCRIPTION_MAX = 4000
export const TICKET_COMMENT_MAX = 2000

export type TicketSort = 'votes' | 'newest'
export function isTicketSort(value: unknown): value is TicketSort {
  return value === 'votes' || value === 'newest'
}

/**
 * Trims and length-checks a free-text field, returning the cleaned value
 * or an error message. Length is capped server-side because the client
 * maxlength attribute is advisory only — an unbounded description would
 * otherwise go straight into Postgres.
 */
export function validateText(
  value: unknown,
  field: string,
  max: number,
  { min = 1 }: { min?: number } = {},
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${field} is required` }
  const trimmed = value.trim()
  if (trimmed.length < min) return { ok: false, error: `${field} is required` }
  if (trimmed.length > max) return { ok: false, error: `${field} must be ${max} characters or fewer` }
  return { ok: true, value: trimmed }
}
