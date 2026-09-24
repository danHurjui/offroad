import { FREE_TIER, hasPro, type ProStatusLike } from './pro'

/**
 * RL-042 (#54): the pricing ladder — every rung's price and vehicle
 * allowance, in one table. The upgrade page, the homepage, /demo, /terms,
 * the structured-data offers and the checkout all read from here (the
 * checkout through `PERSONAL_PLANS` in stripe.ts, which takes its prices
 * from this table), so a price cannot be quoted in one place and charged
 * in another.
 *
 * - **Free** and **Personal** are for one person's own vehicles. Personal
 *   is what `hasPro()` answers for: the paid features on personal vehicles.
 * - **Pro**, **Business** and **Fleet** are company plans — several users,
 *   drivers, trip sheets — bought by an organisation (`ORG_PLANS`), never
 *   by a person. "Pro" means only this 10-vehicle company rung.
 *
 * Pure and free of Stripe, so client components can import it.
 */

export type TierId = 'FREE' | 'PERSONAL' | 'PRO' | 'BUSINESS' | 'FLEET'

export interface FleetStep {
  vehicles: number
  monthlyRon: number
  annualRon: number
}

export interface Tier {
  id: TierId
  /** Vehicles included; for Fleet, the largest step. */
  vehicles: number
  monthlyRon: number
  annualRon: number
  /** Only Personal is sold once and for good. */
  lifetimeRon: number | null
  /** A company plan (several users) rather than one person's. */
  company: boolean
  /** Fleet is priced in steps by vehicle count; empty for the others. */
  steps: FleetStep[]
}

/** Fleet's fixed steps. The annual price is ten months. */
export const FLEET_STEPS: FleetStep[] = [
  { vehicles: 100, monthlyRon: 199, annualRon: 1990 },
  { vehicles: 250, monthlyRon: 349, annualRon: 3490 },
  { vehicles: 500, monthlyRon: 499, annualRon: 4990 },
]

export const LADDER: Record<TierId, Tier> = {
  FREE: { id: 'FREE', vehicles: FREE_TIER.vehicles, monthlyRon: 0, annualRon: 0, lifetimeRon: null, company: false, steps: [] },
  PERSONAL: { id: 'PERSONAL', vehicles: 3, monthlyRon: 9.9, annualRon: 99, lifetimeRon: 299, company: false, steps: [] },
  PRO: { id: 'PRO', vehicles: 10, monthlyRon: 29.9, annualRon: 299, lifetimeRon: null, company: true, steps: [] },
  BUSINESS: { id: 'BUSINESS', vehicles: 50, monthlyRon: 99, annualRon: 990, lifetimeRon: null, company: true, steps: [] },
  FLEET: {
    id: 'FLEET',
    vehicles: FLEET_STEPS[FLEET_STEPS.length - 1].vehicles,
    monthlyRon: FLEET_STEPS[0].monthlyRon,
    annualRon: FLEET_STEPS[0].annualRon,
    lifetimeRon: null,
    company: true,
    steps: FLEET_STEPS,
  },
}

export const TIER_ORDER: TierId[] = ['FREE', 'PERSONAL', 'PRO', 'BUSINESS', 'FLEET']

/**
 * The plans sold before the ladder. Nobody can buy one any more; the people
 * who hold one keep it, and keep it uncapped (below). The webhook still
 * accepts them, for a checkout opened just before the change and completed
 * after it.
 */
export const LEGACY_PLAN_IDS = ['MONTHLY', 'ANNUAL', 'LIFETIME'] as const
export type LegacyPlanId = (typeof LEGACY_PLAN_IDS)[number]

export const PERSONAL_PLAN_IDS = ['PERSONAL_MONTHLY', 'PERSONAL_ANNUAL', 'PERSONAL_LIFETIME'] as const
export type PersonalPlanId = (typeof PERSONAL_PLAN_IDS)[number]

/** Every value `User.proPlan` can hold. */
export type StoredPlanId = LegacyPlanId | PersonalPlanId

export function isPersonalPlanId(value: unknown): value is PersonalPlanId {
  return (PERSONAL_PLAN_IDS as readonly unknown[]).includes(value)
}

export function isStoredPlanId(value: unknown): value is StoredPlanId {
  return isPersonalPlanId(value) || (LEGACY_PLAN_IDS as readonly unknown[]).includes(value)
}

// ─── Company plans (slice 3) ────────────────────────────────────────────

/** What an organisation can buy: each company rung, monthly or annual; Fleet by step. */
export const ORG_PLAN_IDS = [
  'PRO_MONTHLY',
  'PRO_ANNUAL',
  'BUSINESS_MONTHLY',
  'BUSINESS_ANNUAL',
  'FLEET_100_MONTHLY',
  'FLEET_100_ANNUAL',
  'FLEET_250_MONTHLY',
  'FLEET_250_ANNUAL',
  'FLEET_500_MONTHLY',
  'FLEET_500_ANNUAL',
] as const
export type OrgPlanId = (typeof ORG_PLAN_IDS)[number]

export interface OrgPlan {
  tier: 'PRO' | 'BUSINESS' | 'FLEET'
  vehicles: number
  period: 'month' | 'year'
  priceRon: number
  /** The environment variable holding its Stripe Price id. */
  envVar: string
}

function orgPlan(id: OrgPlanId): OrgPlan {
  const period = id.endsWith('_ANNUAL') ? 'year' : 'month'
  const fleet = /^FLEET_(\d+)_/.exec(id)
  const envVar = `STRIPE_PRICE_ORG_${id}`
  if (fleet) {
    const step = FLEET_STEPS.find((s) => s.vehicles === Number(fleet[1]))!
    return { tier: 'FLEET', vehicles: step.vehicles, period, priceRon: period === 'year' ? step.annualRon : step.monthlyRon, envVar }
  }
  const tier = id.startsWith('PRO_') ? 'PRO' : 'BUSINESS'
  const rung = LADDER[tier]
  return { tier, vehicles: rung.vehicles, period, priceRon: period === 'year' ? rung.annualRon : rung.monthlyRon, envVar }
}

/** Every company plan, its allowance and price read from the ladder above. */
export const ORG_PLANS = Object.fromEntries(ORG_PLAN_IDS.map((id) => [id, orgPlan(id)])) as Record<OrgPlanId, OrgPlan>

export function isOrgPlanId(value: unknown): value is OrgPlanId {
  return (ORG_PLAN_IDS as readonly unknown[]).includes(value)
}

/** What `orgVehicleLimit()` reads. */
export const ORG_PLAN_SELECT = { plan: true, compedAt: true } as const

export interface OrgPlanStatusLike {
  plan: string | null
  compedAt: Date | null
}

/**
 * How many vehicles an organisation may hold; null is no cap.
 * - comped (the closed beta, or a beta account's organisation made before
 *   billing was configured): no cap;
 * - a plan: that plan's allowance;
 * - no plan: none. An organisation can exist and invite people before it
 *   pays, but holds vehicles only on a plan — and one whose plan lapsed
 *   keeps them all, read-only (`overLimitIds()` with a limit of 0).
 */
export function orgVehicleLimit(org: OrgPlanStatusLike | null | undefined): number | null {
  if (!org) return 0
  if (org.compedAt) return null
  return isOrgPlanId(org.plan) ? ORG_PLANS[org.plan].vehicles : 0
}

// ─── Grandfathering ─────────────────────────────────────────────────────

/** What `vehicleLimit()` reads. Select it whole, like PRO_SELECT. */
export const PLAN_SELECT = { isPro: true, isProComped: true, proPlan: true, grandfatheredAt: true } as const

export interface PlanStatusLike extends ProStatusLike {
  proPlan: string | null
  grandfatheredAt: Date | null
}

/**
 * Whether this account keeps the entitlement it held before the ladder:
 * Personal with **no vehicle cap**.
 *
 * `grandfatheredAt` was stamped by the migration on everyone holding Pro
 * that day. It covers them while they still hold *that* entitlement:
 * - a comp (founding members and admin comps) — `isProComped` is never
 *   touched by Stripe, so it lasts as long as the comp does;
 * - a plan bought before the ladder — a legacy Monthly/Annual for as long
 *   as it renews, a legacy Lifetime for good. A null plan on a paying
 *   account predates the column and is read as legacy, the generous way.
 *
 * Somebody who let a legacy subscription lapse and later buys Personal is
 * buying today's product, at today's price, with today's allowance.
 */
export function isGrandfathered(user: PlanStatusLike | null | undefined): boolean {
  if (!user || !user.grandfatheredAt) return false
  if (user.isProComped) return true
  return user.isPro && !isPersonalPlanId(user.proPlan)
}

/** The rung a personal account is on. */
export function personalTier(user: PlanStatusLike | null | undefined): 'FREE' | 'PERSONAL' {
  return hasPro(user) ? 'PERSONAL' : 'FREE'
}

/**
 * How many personal vehicles this account may hold; null is no cap.
 * Company vehicles never count (they are the organisation's).
 */
export function vehicleLimit(user: PlanStatusLike | null | undefined): number | null {
  if (isGrandfathered(user)) return null
  return LADDER[personalTier(user)].vehicles
}

/**
 * RL-042 (#54): which personal vehicles sit beyond the allowance — those
 * are **read-only, never deleted**. The oldest `limit` stay writable (the
 * ones the account had room for first); the rest, newest first, are the
 * ones over. Pure; `vehicleAllowance.ts` loads the rows.
 */
export function overLimitIds(vehicles: Array<{ id: string; createdAt: Date }>, limit: number | null): string[] {
  if (limit === null || vehicles.length <= limit) return []
  const ordered = [...vehicles].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  return ordered.slice(limit).map((v) => v.id)
}

// ─── Prices, for display ────────────────────────────────────────────────

/**
 * "9,90" / "99" (or "9.90" in English): a plan price the way the pages
 * quote it. Always a string — handed to a message as a number, 9.9 would
 * render as "9.9".
 */
export function formatPlanPrice(ron: number, locale: string = 'ro'): string {
  return ron.toLocaleString(locale === 'en' ? 'en-GB' : 'ro-RO', { minimumFractionDigits: Number.isInteger(ron) ? 0 : 2, maximumFractionDigits: 2 })
}
