import type { Prisma } from '@prisma/client'

/**
 * RL-038 organisation accounts, slice 1: the company and its members.
 * Vehicles do not belong to an organisation yet, so nothing here changes
 * who can see a vehicle — that is a later slice, and the riskiest one.
 *
 * Creating an organisation is a closed beta: an admin switches it on per
 * account (`User.orgBetaAt`) until the Business tier exists (#54).
 */

export const ORG_ROLES = ['OWNER', 'FLEET_MANAGER', 'MECHANIC', 'DRIVER'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const ORG_NAME_MAX = 120
export const BILLING_ADDRESS_MAX = 300

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value)
}

/** Running the organisation itself — details, members, deleting it — is the owners'. */
export function canManageOrganization(role: OrgRole): boolean {
  return role === 'OWNER'
}

/** The weights ANAF publishes for the CUI check digit, aligned to the right. */
const CUI_KEY = [7, 5, 3, 2, 1, 7, 5, 3, 2]

/**
 * A Romanian fiscal code (CUI/CIF), normalised: upper case, no spaces or
 * dots, an optional `RO` prefix kept (it says the company is registered
 * for VAT). Null when it is not a well-formed code with a correct check
 * digit — which catches a typo, not a company that does not exist; that
 * would need a registry lookup, and nothing here claims one.
 */
export function normalizeCui(input: string): string | null {
  const compact = input.replace(/[\s.]/g, '').toUpperCase()
  const match = /^(RO)?(\d{2,10})$/.exec(compact)
  if (!match) return null
  const digits = match[2]
  const body = digits.slice(0, -1).padStart(9, '0')
  const sum = body.split('').reduce((acc, d, i) => acc + Number(d) * CUI_KEY[i], 0)
  const check = ((sum * 10) % 11) % 10
  if (check !== Number(digits[digits.length - 1])) return null
  return `${match[1] ?? ''}${digits}`
}

export type OrganizationField = 'name' | 'cui' | 'billingAddress'

export type OrganizationData = Partial<{ name: string; cui: string | null; billingAddress: string | null }>

export type OrganizationParse = { ok: true; data: OrganizationData } | { ok: false; field: OrganizationField }

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** On create the name is required; on edit only the fields sent are returned. */
export function parseOrganization(body: Record<string, unknown>, { create }: { create: boolean }): OrganizationParse {
  const data: OrganizationData = {}
  if (body.name !== undefined || create) {
    if (typeof body.name !== 'string') return { ok: false, field: 'name' }
    const name = body.name.trim()
    if (name.length === 0 || name.length > ORG_NAME_MAX) return { ok: false, field: 'name' }
    data.name = name
  }
  if (body.cui !== undefined) {
    if (blank(body.cui)) data.cui = null
    else {
      const cui = typeof body.cui === 'string' ? normalizeCui(body.cui) : null
      if (!cui) return { ok: false, field: 'cui' }
      data.cui = cui
    }
  }
  if (body.billingAddress !== undefined) {
    if (blank(body.billingAddress)) data.billingAddress = null
    else {
      if (typeof body.billingAddress !== 'string') return { ok: false, field: 'billingAddress' }
      const address = body.billingAddress.trim()
      if (address.length > BILLING_ADDRESS_MAX) return { ok: false, field: 'billingAddress' }
      data.billingAddress = address
    }
  }
  return { ok: true, data }
}

export type MemberChange = { kind: 'role'; role: OrgRole } | { kind: 'remove' }

/**
 * The one rule about members that is not about who is asking: an
 * organisation always keeps an OWNER. The last one cannot be demoted or
 * removed, and cannot leave — they hand the role on first, or delete the
 * organisation. `owners` must be counted under the organisation's row lock
 * (`lockOrganization`), or two owners demoting each other at once would
 * both see the other still standing.
 */
export function lastOwnerBlocks(target: { role: OrgRole }, change: MemberChange, owners: number): boolean {
  if (target.role !== 'OWNER' || owners > 1) return false
  return change.kind === 'remove' || change.role !== 'OWNER'
}

/**
 * Serialises every membership change in one organisation: the owner count
 * read after this is the one the write will land against. Must run inside
 * the interactive transaction doing the write.
 */
export async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`
  return rows.length > 0
}

/**
 * What deleting an account does to its organisations. A membership just
 * goes with the account — but an organisation where this is the last
 * OWNER and other people remain would be left with nobody able to run it,
 * so the deletion is refused until the role is handed on (`blocking`). An
 * organisation with nobody else in it goes with the account (`solo`).
 */
export function organizationsOnAccountDeletion(
  memberships: Array<{ role: OrgRole; organization: { id: string; name: string; members: Array<{ role: OrgRole }> } }>
): { solo: string[]; blocking: Array<{ id: string; name: string }> } {
  const solo: string[] = []
  const blocking: Array<{ id: string; name: string }> = []
  for (const m of memberships) {
    const { members } = m.organization
    if (members.length <= 1) solo.push(m.organization.id)
    else if (m.role === 'OWNER' && members.filter((x) => x.role === 'OWNER').length <= 1) {
      blocking.push({ id: m.organization.id, name: m.organization.name })
    }
  }
  return { solo, blocking }
}
