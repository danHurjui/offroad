import fs from 'fs'
import path from 'path'
import {
  FLEET_STEPS,
  isGrandfathered,
  isPersonalPlanId,
  isStoredPlanId,
  LADDER,
  LEGACY_PLAN_IDS,
  PERSONAL_PLAN_IDS,
  TIER_ORDER,
  formatPlanPrice,
  isOrgPlanId,
  ORG_PLAN_IDS,
  ORG_PLANS,
  orgVehicleLimit,
  overLimitIds,
  type OrgPlanId,
  vehicleLimit,
  type PlanStatusLike,
} from '@/lib/plans'
import { FREE_TIER } from '@/lib/pro'
import { PERSONAL_PLANS } from '@/lib/stripe'

const DAY = new Date('2026-10-03T12:00:00Z')

function user(over: Partial<PlanStatusLike>): PlanStatusLike {
  return { isPro: false, isProComped: false, proPlan: null, grandfatheredAt: null, ...over }
}

describe('the ladder', () => {
  it('climbs: each rung holds more vehicles and costs more than the one below', () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const below = LADDER[TIER_ORDER[i - 1]]
      const above = LADDER[TIER_ORDER[i]]
      expect(above.vehicles).toBeGreaterThan(below.vehicles)
      expect(above.monthlyRon).toBeGreaterThan(below.monthlyRon)
    }
  })

  it('has the prices #54 settled', () => {
    expect(LADDER.FREE).toMatchObject({ vehicles: FREE_TIER.vehicles, monthlyRon: 0 })
    expect(LADDER.PERSONAL).toMatchObject({ vehicles: 3, monthlyRon: 9.9 })
    expect(LADDER.PRO).toMatchObject({ vehicles: 10, monthlyRon: 29.9 })
    expect(LADDER.BUSINESS).toMatchObject({ vehicles: 50, monthlyRon: 99 })
    expect(FLEET_STEPS.map((s) => [s.vehicles, s.monthlyRon])).toEqual([
      [100, 199],
      [250, 349],
      [500, 499],
    ])
  })

  it('sells Lifetime on Personal only', () => {
    for (const id of TIER_ORDER) {
      if (id === 'PERSONAL') expect(LADDER[id].lifetimeRon).not.toBeNull()
      else expect(LADDER[id].lifetimeRon).toBeNull()
    }
  })

  // RL-042 slice 3: the company rungs are sold to organisations.
  it('prices every company plan from the ladder, annual at ten months', () => {
    expect(ORG_PLANS.PRO_MONTHLY).toMatchObject({ tier: 'PRO', vehicles: 10, period: 'month', priceRon: LADDER.PRO.monthlyRon })
    expect(ORG_PLANS.BUSINESS_ANNUAL).toMatchObject({ tier: 'BUSINESS', vehicles: 50, period: 'year', priceRon: LADDER.BUSINESS.annualRon })
    for (const step of FLEET_STEPS) {
      const monthly = ORG_PLANS[`FLEET_${step.vehicles}_MONTHLY` as OrgPlanId]
      const annual = ORG_PLANS[`FLEET_${step.vehicles}_ANNUAL` as OrgPlanId]
      expect(monthly).toMatchObject({ tier: 'FLEET', vehicles: step.vehicles, priceRon: step.monthlyRon })
      expect(annual.priceRon).toBe(step.monthlyRon * 10)
    }
    expect(new Set(ORG_PLAN_IDS.map((id) => ORG_PLANS[id].envVar)).size).toBe(ORG_PLAN_IDS.length)
  })

  it('never sells a company plan to a person, or Personal to an organisation', () => {
    for (const id of ORG_PLAN_IDS) expect(isPersonalPlanId(id)).toBe(false)
    for (const id of PERSONAL_PLAN_IDS) expect(isOrgPlanId(id)).toBe(false)
  })

  it('charges at checkout exactly what the ladder quotes', () => {
    expect(PERSONAL_PLANS.PERSONAL_MONTHLY.priceRon).toBe(LADDER.PERSONAL.monthlyRon)
    expect(PERSONAL_PLANS.PERSONAL_ANNUAL.priceRon).toBe(LADDER.PERSONAL.annualRon)
    expect(PERSONAL_PLANS.PERSONAL_LIFETIME.priceRon).toBe(LADDER.PERSONAL.lifetimeRon)
    expect(Object.keys(PERSONAL_PLANS).sort()).toEqual([...PERSONAL_PLAN_IDS].sort())
  })

  it('sells none of the retired plans', () => {
    for (const id of LEGACY_PLAN_IDS) {
      expect(isPersonalPlanId(id)).toBe(false)
      expect(isStoredPlanId(id)).toBe(true)
      expect(Object.keys(PERSONAL_PLANS)).not.toContain(id)
    }
  })

  it('writes prices the way each language does', () => {
    expect(formatPlanPrice(9.9, 'ro')).toBe('9,90')
    expect(formatPlanPrice(9.9, 'en')).toBe('9.90')
    expect(formatPlanPrice(99, 'ro')).toBe('99')
  })
})

/**
 * #54's acceptance criterion: a grandfathered account resolves to Personal
 * with no vehicle cap, and a test fails if a future tier change quietly
 * re-caps it. These are that test — every group that held Pro before the
 * ladder, one by one.
 */
describe('grandfathered accounts are never capped', () => {
  const groups: [string, Partial<PlanStatusLike>][] = [
    ['a founding member (comped)', { isProComped: true }],
    ['an admin comp', { isProComped: true }],
    ['a Monthly subscriber', { isPro: true, proPlan: 'MONTHLY' }],
    ['an Annual subscriber', { isPro: true, proPlan: 'ANNUAL' }],
    ['a Lifetime buyer', { isPro: true, proPlan: 'LIFETIME' }],
    ['a paying account from before proPlan was recorded', { isPro: true, proPlan: null }],
    ['a comped account that also bought Personal', { isProComped: true, isPro: true, proPlan: 'PERSONAL_MONTHLY' }],
  ]

  it.each(groups)('%s', (_label, over) => {
    const account = user({ ...over, grandfatheredAt: DAY })
    expect(isGrandfathered(account)).toBe(true)
    expect(vehicleLimit(account)).toBeNull()
  })

  it('whatever the ladder says Personal holds', () => {
    // A future change to Personal's allowance must not reach them.
    const account = user({ isPro: true, proPlan: 'MONTHLY', grandfatheredAt: DAY })
    expect(vehicleLimit(account)).not.toBe(LADDER.PERSONAL.vehicles)
  })
})

describe('everyone else gets the allowance of their rung', () => {
  it('Free holds one', () => {
    expect(vehicleLimit(user({}))).toBe(FREE_TIER.vehicles)
    expect(vehicleLimit(null)).toBe(FREE_TIER.vehicles)
  })

  it('Personal holds three', () => {
    expect(vehicleLimit(user({ isPro: true, proPlan: 'PERSONAL_ANNUAL' }))).toBe(3)
  })

  it('a comp granted after the ladder is Personal', () => {
    expect(vehicleLimit(user({ isProComped: true }))).toBe(3)
  })

  it('a grandfathered subscriber who cancelled is Free again', () => {
    expect(vehicleLimit(user({ grandfatheredAt: DAY }))).toBe(FREE_TIER.vehicles)
  })

  it('and buying Personal later is buying today’s Personal', () => {
    const account = user({ isPro: true, proPlan: 'PERSONAL_MONTHLY', grandfatheredAt: DAY })
    expect(isGrandfathered(account)).toBe(false)
    expect(vehicleLimit(account)).toBe(3)
  })
})

describe('an organisation’s allowance', () => {
  it('is uncapped while comped (the closed beta)', () => {
    expect(orgVehicleLimit({ plan: null, compedAt: DAY })).toBeNull()
    expect(orgVehicleLimit({ plan: 'PRO_MONTHLY', compedAt: DAY })).toBeNull()
  })

  it('is its plan’s', () => {
    expect(orgVehicleLimit({ plan: 'PRO_ANNUAL', compedAt: null })).toBe(10)
    expect(orgVehicleLimit({ plan: 'FLEET_250_MONTHLY', compedAt: null })).toBe(250)
  })

  it('is none without a plan — so a lapsed one keeps its vehicles, all read-only', () => {
    expect(orgVehicleLimit({ plan: null, compedAt: null })).toBe(0)
    expect(orgVehicleLimit({ plan: 'SOMETHING_ELSE', compedAt: null })).toBe(0)
    expect(orgVehicleLimit(null)).toBe(0)
    expect(overLimitIds([{ id: 'a', createdAt: DAY }], 0)).toEqual(['a'])
  })
})

describe('the organisation billing migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'prisma', 'migrations', '20261004120000_organization_billing', 'migration.sql'),
    'utf8'
  )

  it('comps every organisation from the closed beta, so none turns read-only the day billing ships', () => {
    expect(sql).toMatch(/UPDATE "Organization" SET "compedAt" = NOW\(\);/)
  })

  it('declares every company plan the code sells', () => {
    for (const id of ORG_PLAN_IDS) expect(sql).toContain(`'${id}'`)
  })
})

describe('the migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'prisma', 'migrations', '20261003120000_pricing_ladder', 'migration.sql'),
    'utf8'
  )

  it('grandfathers everyone holding Pro, paid or comped', () => {
    expect(sql).toMatch(/UPDATE "User" SET "grandfatheredAt" = NOW\(\) WHERE "isPro" = true OR "isProComped" = true/)
  })

  it('adds the Personal plans without dropping the retired ones', () => {
    for (const id of PERSONAL_PLAN_IDS) expect(sql).toContain(`ADD VALUE '${id}'`)
    expect(sql).not.toMatch(/DROP|RENAME/i)
  })

  it('is the only writer of grandfatheredAt', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name) && !full.includes('__tests__')) {
          if (/grandfatheredAt\s*:\s*(new Date|null|now)/.test(fs.readFileSync(full, 'utf8'))) offenders.push(full)
        }
      }
    }
    walk(path.join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})
