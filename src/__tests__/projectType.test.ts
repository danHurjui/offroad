import {
  isProjectType,
  isValidCategory,
  isValidStatus,
  isValidPhotoType,
  isValidTaskVocabulary,
  labelFor,
  PROJECT_TYPE_CONFIG,
} from '@/lib/projectType'

describe('isProjectType', () => {
  it('accepts OFFROAD and RESTORATION', () => {
    expect(isProjectType('OFFROAD')).toBe(true)
    expect(isProjectType('RESTORATION')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isProjectType('SUPABASE')).toBe(false)
    expect(isProjectType(undefined)).toBe(false)
  })
})

describe('vocabulary validation is mode-scoped', () => {
  it('an off-road category is invalid for restoration', () => {
    expect(isValidCategory('OFFROAD', 'SUSPENSION')).toBe(true)
    expect(isValidCategory('RESTORATION', 'SUSPENSION')).toBe(false)
  })
  it('a restoration status is invalid for off-road', () => {
    expect(isValidStatus('RESTORATION', 'STRIPPED')).toBe(true)
    expect(isValidStatus('OFFROAD', 'STRIPPED')).toBe(false)
  })
  it('a restoration photo type is invalid for off-road', () => {
    expect(isValidPhotoType('RESTORATION', 'FOUND_STATE')).toBe(true)
    expect(isValidPhotoType('OFFROAD', 'FOUND_STATE')).toBe(false)
  })
})

describe('isValidTaskVocabulary', () => {
  it('requires both category and status to belong to the same mode', () => {
    expect(isValidTaskVocabulary('OFFROAD', 'SUSPENSION', 'DONE')).toBe(true)
    expect(isValidTaskVocabulary('OFFROAD', 'BODY_PANELS', 'DONE')).toBe(false)
    expect(isValidTaskVocabulary('OFFROAD', 'SUSPENSION', 'STRIPPED')).toBe(false)
  })
  it('rejects an invalid projectType outright', () => {
    expect(isValidTaskVocabulary('BOGUS', 'SUSPENSION', 'DONE')).toBe(false)
  })
})

describe('labelFor', () => {
  it('resolves a known value to its label', () => {
    expect(labelFor(PROJECT_TYPE_CONFIG.OFFROAD.categories, 'SUSPENSION')).toBe('Suspension')
  })
  it('falls back to the raw value when unknown', () => {
    expect(labelFor(PROJECT_TYPE_CONFIG.OFFROAD.categories, 'MYSTERY')).toBe('MYSTERY')
  })
})

describe('completeStatus', () => {
  // Regression: off-road's statusTags list order follows the product doc
  // ("Done · Planned · Broken · In Progress · Sourced"), which puts DONE
  // first — code that assumed "the terminal status is the last array
  // entry" (as the vehicle dashboard's progress % and the wishlist
  // convert-to-task route both used to) silently used SOURCED instead.
  it('is DONE for off-road, not the last statusTags entry', () => {
    expect(PROJECT_TYPE_CONFIG.OFFROAD.completeStatus).toBe('DONE')
    expect(PROJECT_TYPE_CONFIG.OFFROAD.completeStatus).not.toBe(
      PROJECT_TYPE_CONFIG.OFFROAD.statusTags[PROJECT_TYPE_CONFIG.OFFROAD.statusTags.length - 1].value
    )
  })

  it('is COMPLETE for restoration', () => {
    expect(PROJECT_TYPE_CONFIG.RESTORATION.completeStatus).toBe('COMPLETE')
  })

  it('is always a value present in that mode\'s own statusTags', () => {
    for (const config of Object.values(PROJECT_TYPE_CONFIG)) {
      expect(config.statusTags.some((s) => s.value === config.completeStatus)).toBe(true)
    }
  })
})

describe('every category set matches the ticket spec size', () => {
  it('off-road has 9 categories (8 build + maintenance)', () => {
    expect(PROJECT_TYPE_CONFIG.OFFROAD.categories).toHaveLength(9)
  })
  it('restoration has 9 categories', () => {
    expect(PROJECT_TYPE_CONFIG.RESTORATION.categories).toHaveLength(9)
  })
})
