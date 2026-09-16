import {
  isProjectType,
  isValidCategory,
  isValidStatus,
  isValidPhotoType,
  isValidTaskVocabulary,
  PROJECT_TYPES,
  PROJECT_TYPE_CONFIG,
  type ProjectType,
} from '@/lib/projectType'
import { computeVehicleProgress } from '@/lib/vehicleProgress'

describe('DAILY_DRIVER is a first-class project type', () => {
  it('is accepted by isProjectType', () => {
    expect(isProjectType('DAILY_DRIVER')).toBe(true)
  })

  it('is listed in PROJECT_TYPES alongside the others', () => {
    expect(PROJECT_TYPES).toEqual(expect.arrayContaining(['OFFROAD', 'RESTORATION', 'DAILY_DRIVER']))
    expect(PROJECT_TYPES).toHaveLength(3)
  })

  // The validator is derived from the config, so this guards against a
  // future mode being added to the config but rejected by the API.
  it('isProjectType stays in sync with the config keys', () => {
    for (const type of PROJECT_TYPES) expect(isProjectType(type)).toBe(true)
    expect(isProjectType('SPACESHIP')).toBe(false)
    expect(isProjectType('')).toBe(false)
    expect(isProjectType(undefined)).toBe(false)
    expect(isProjectType(null)).toBe(false)
  })

  // hasOwnProperty guard — 'toString' is on Object.prototype, not a mode.
  it('does not accept inherited object properties as a project type', () => {
    expect(isProjectType('toString')).toBe(false)
    expect(isProjectType('constructor')).toBe(false)
  })
})

describe('DAILY_DRIVER vocabulary', () => {
  const config = PROJECT_TYPE_CONFIG.DAILY_DRIVER

  it('is repair/servicing oriented, not build stages', () => {
    expect(isValidCategory('DAILY_DRIVER', 'SERVICING')).toBe(true)
    expect(isValidCategory('DAILY_DRIVER', 'BRAKES')).toBe(true)
    expect(isValidCategory('DAILY_DRIVER', 'INSPECTION')).toBe(true)
  })

  it('does not share the other modes vocabularies', () => {
    // a restoration stage is not a daily-driver category
    expect(isValidCategory('DAILY_DRIVER', 'PAINT')).toBe(false)
    expect(isValidCategory('DAILY_DRIVER', 'BODY_PANELS')).toBe(false)
    // and a daily-driver category is not valid for the others
    expect(isValidCategory('OFFROAD', 'SERVICING')).toBe(false)
    expect(isValidCategory('RESTORATION', 'BRAKES')).toBe(false)
  })

  it('uses repair statuses', () => {
    expect(isValidStatus('DAILY_DRIVER', 'DUE')).toBe(true)
    expect(isValidStatus('DAILY_DRIVER', 'BOOKED')).toBe(true)
    expect(isValidStatus('DAILY_DRIVER', 'DEFERRED')).toBe(true)
    expect(isValidStatus('DAILY_DRIVER', 'STRIPPED')).toBe(false)
    expect(isValidStatus('OFFROAD', 'BOOKED')).toBe(false)
  })

  it('uses fault/repair photo types', () => {
    expect(isValidPhotoType('DAILY_DRIVER', 'FAULT')).toBe(true)
    expect(isValidPhotoType('DAILY_DRIVER', 'REPAIR')).toBe(true)
    expect(isValidPhotoType('DAILY_DRIVER', 'TRAIL')).toBe(false)
  })

  it('rejects a mixed-mode category/status pair', () => {
    expect(isValidTaskVocabulary('DAILY_DRIVER', 'BRAKES', 'DONE')).toBe(true)
    // right category, wrong mode's status
    expect(isValidTaskVocabulary('DAILY_DRIVER', 'BRAKES', 'PRIMED')).toBe(false)
    // right status, wrong mode's category
    expect(isValidTaskVocabulary('DAILY_DRIVER', 'PAINT', 'DONE')).toBe(false)
  })

  it('treats DONE as the completing status', () => {
    expect(config.completeStatus).toBe('DONE')
    expect(isValidStatus('DAILY_DRIVER', config.completeStatus)).toBe(true)
  })
})

describe('completion tracking', () => {
  it('a daily driver has no end state', () => {
    expect(PROJECT_TYPE_CONFIG.DAILY_DRIVER.tracksCompletion).toBe(false)
  })

  it('builds and restorations do work towards one', () => {
    expect(PROJECT_TYPE_CONFIG.OFFROAD.tracksCompletion).toBe(true)
    expect(PROJECT_TYPE_CONFIG.RESTORATION.tracksCompletion).toBe(true)
  })

  // The feed gates its "complete" badge on tracksCompletion, so even a
  // daily driver with every category serviced must not read as finished.
  it('a fully-serviced daily driver is still not "complete" in the feed', () => {
    const config = PROJECT_TYPE_CONFIG.DAILY_DRIVER
    const tasks = config.categories.map((c) => ({ category: c.value, status: config.completeStatus }))
    const { isComplete } = computeVehicleProgress(tasks, config.categories.length, config.completeStatus)
    expect(isComplete).toBe(true) // raw category math says yes...
    expect(config.tracksCompletion && isComplete).toBe(false) // ...but the mode never claims it
  })
})

describe('every mode is fully configured', () => {
  it.each(PROJECT_TYPES)('%s has a complete, self-consistent config', (type: ProjectType) => {
    const config = PROJECT_TYPE_CONFIG[type]
    expect(config.label).toBeTruthy()
    expect(config.screenTitle).toBeTruthy()
    expect(config.progressLabel).toBeTruthy()
    expect(config.addTaskCta).toBeTruthy()
    expect(config.wishlistLabel).toBeTruthy()
    expect(config.communityTabLabel).toBeTruthy()
    expect(config.categories.length).toBeGreaterThan(0)
    expect(config.statusTags.length).toBeGreaterThan(0)
    expect(config.photoTypes.length).toBeGreaterThan(0)
    expect(config.wishlistStatuses.length).toBeGreaterThan(0)
    // completeStatus must be one of the mode's own status tags
    expect(config.statusTags.map((s) => s.value)).toContain(config.completeStatus)
  })

  it.each(PROJECT_TYPES)('%s has no duplicate option values', (type: ProjectType) => {
    const config = PROJECT_TYPE_CONFIG[type]
    for (const list of [config.categories, config.statusTags, config.photoTypes, config.wishlistStatuses]) {
      const values = list.map((o) => o.value)
      expect(new Set(values).size).toBe(values.length)
    }
  })
})
