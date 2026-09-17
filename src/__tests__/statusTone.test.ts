import fs from 'fs'
import path from 'path'
import {
  PROJECT_TYPES,
  PROJECT_TYPE_CONFIG,
  statusBadgeClass,
  type StatusOption,
} from '@/lib/projectType'
import { translateConfig } from '@/lib/vocabulary'

/**
 * A finished job and one still on the ramp used to look identical: every
 * status rendered as the same flat grey in the vehicle list, and as the
 * same brand purple on the task detail.
 */
describe('status tones', () => {
  it.each(PROJECT_TYPES)('%s marks its complete status as success', (projectType) => {
    const config = PROJECT_TYPE_CONFIG[projectType]
    const complete = config.statusTags.find((s) => s.value === config.completeStatus)
    expect(complete?.tone).toBe('success')
  })

  it.each(PROJECT_TYPES)('%s gives in-progress work its own tone, distinct from done', (projectType) => {
    const config = PROJECT_TYPE_CONFIG[projectType]
    const inProgress = config.statusTags.find((s) => s.value === 'IN_PROGRESS')
    expect(inProgress).toBeDefined()
    expect(inProgress!.tone).not.toBe('success')
    expect(statusBadgeClass(config.statusTags, 'IN_PROGRESS')).not.toBe(
      statusBadgeClass(config.statusTags, config.completeStatus)
    )
  })

  it('falls back to neutral for a status the mode no longer has', () => {
    // Pitfall #2: a row keeps the vocabulary it was written with, so a
    // status can outlive its config entry. That must not throw.
    expect(statusBadgeClass(PROJECT_TYPE_CONFIG.OFFROAD.statusTags, 'FROM_2019')).toBe('badge badge-neutral')
  })

  it('keeps the tone through translation', () => {
    // relabel() rebuilds each option from value + label, and StatusOption
    // is assignable to Option, so a status routed through it would lose
    // its colour with nothing to complain.
    const translated = translateConfig('DAILY_DRIVER', (key) => `t:${key}`)
    for (const status of PROJECT_TYPE_CONFIG.DAILY_DRIVER.statusTags) {
      const match = translated.statusTags.find((s) => s.value === status.value)
      expect(match?.tone).toBe(status.tone)
      expect(match?.label).toBe(`t:status.DAILY_DRIVER.${status.value}`)
    }
  })

  it('only uses badge classes globals.css actually defines', () => {
    // A tone naming a class that does not exist renders as an unstyled
    // pill, and Tailwind gives no warning for it.
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')
    const every: StatusOption[] = PROJECT_TYPES.flatMap((p) => PROJECT_TYPE_CONFIG[p].statusTags)
    for (const status of every) {
      const className = statusBadgeClass([status], status.value).replace('badge ', '')
      expect(css).toContain(`.${className} {`)
    }
  })
})
