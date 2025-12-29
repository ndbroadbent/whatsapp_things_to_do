import { describe, expect, it } from 'vitest'
import {
  buildImageUrl,
  findActionFallbackImage,
  findCategoryFallbackImage,
  findObjectImage,
  MEDIA_CDN_URL,
  type MediaIndex
} from './media-index'

/** Minimal test index for unit tests */
const TEST_INDEX: MediaIndex = {
  version: 3,
  generated: '2025-01-01T00:00:00.000Z',
  base_url: MEDIA_CDN_URL,
  sizes: [700, 400, 128],
  objects: {
    swimming: ['hash1', 'hash2', 'hash3'],
    'hiking trail': ['trail1', 'trail2'],
    'american football': ['football1'],
    sushi: ['sushi1', 'sushi2']
  },
  categories: {
    fitness: { objects: ['swimming', 'hiking trail'] },
    food: { objects: ['sushi'] },
    nature: { objects: ['hiking trail'] }
  },
  synonyms: {
    objects: {
      swimming: ['swim', 'bathe', 'go swimming'],
      'hiking trail': ['hiking', 'bushwalk', 'tramping track'],
      sushi: ['sashimi', 'japanese raw fish']
    },
    object_actions: {
      swimming: ['swim'],
      'hiking trail': ['hike', 'tramp'],
      biking: ['bike', 'cycle']
    },
    regional: {
      US: { objects: { football: 'american football' } },
      AU: { objects: { footy: 'australian football' } }
    }
  }
}

describe('findObjectImage', () => {
  it('finds direct object match', () => {
    const result = findObjectImage('swimming', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('swimming')
    expect(result?.matchType).toBe('object')
    expect(['hash1', 'hash2', 'hash3']).toContain(result?.imageHash)
  })

  it('finds object with spaces', () => {
    const result = findObjectImage('hiking trail', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('hiking trail')
    expect(result?.matchType).toBe('object')
  })

  it('normalizes underscores to spaces', () => {
    const result = findObjectImage('hiking_trail', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('hiking trail')
  })

  it('finds synonym match', () => {
    const result = findObjectImage('bushwalk', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('hiking trail')
    expect(result?.matchType).toBe('synonym')
  })

  it('finds synonym match case-insensitive', () => {
    const result = findObjectImage('Go Swimming', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('swimming')
    expect(result?.matchType).toBe('synonym')
  })

  it('returns null for unknown object', () => {
    const result = findObjectImage('skydiving', TEST_INDEX)
    expect(result).toBeNull()
  })

  it('applies regional override for US', () => {
    const result = findObjectImage('football', TEST_INDEX, { countryCode: 'US' })
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('american football')
    expect(result?.matchType).toBe('object')
  })

  it('does not apply regional override when no country code', () => {
    const result = findObjectImage('football', TEST_INDEX)
    expect(result).toBeNull()
  })
})

describe('findActionFallbackImage', () => {
  it('finds action verb match', () => {
    const result = findActionFallbackImage('swim', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('swimming')
    expect(result?.matchType).toBe('action')
  })

  it('finds action verb case-insensitive', () => {
    const result = findActionFallbackImage('HIKE', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.objectName).toBe('hiking trail')
    expect(result?.matchType).toBe('action')
  })

  it('returns null for ambiguous verbs', () => {
    const result = findActionFallbackImage('go', TEST_INDEX)
    expect(result).toBeNull()
  })

  it('returns null for object that has no images', () => {
    const indexWithEmptyObject: MediaIndex = {
      ...TEST_INDEX,
      objects: { ...TEST_INDEX.objects, biking: [] },
      synonyms: {
        ...TEST_INDEX.synonyms,
        object_actions: { biking: ['bike', 'cycle'] }
      }
    }
    const result = findActionFallbackImage('bike', indexWithEmptyObject)
    expect(result).toBeNull()
  })
})

describe('findCategoryFallbackImage', () => {
  it('finds category fallback', () => {
    const result = findCategoryFallbackImage('fitness', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(['swimming', 'hiking trail']).toContain(result?.objectName)
    expect(result?.matchType).toBe('category')
  })

  it('returns null for unknown category', () => {
    const result = findCategoryFallbackImage('entertainment', TEST_INDEX)
    expect(result).toBeNull()
  })

  it('returns null for category with empty objects', () => {
    const indexWithEmptyCategory: MediaIndex = {
      ...TEST_INDEX,
      categories: { ...TEST_INDEX.categories, empty: { objects: [] } }
    }
    const result = findCategoryFallbackImage('empty', indexWithEmptyCategory)
    expect(result).toBeNull()
  })
})

describe('buildImageUrl', () => {
  it('builds CDN URL with default size', () => {
    const match = { objectName: 'swimming', imageHash: 'abc123', matchType: 'object' as const }
    const url = buildImageUrl(match)
    expect(url).toBe(`${MEDIA_CDN_URL}/objects/swimming/abc123-700.jpg`)
  })

  it('builds CDN URL with specified size', () => {
    const match = { objectName: 'swimming', imageHash: 'abc123', matchType: 'object' as const }
    const url = buildImageUrl(match, 128)
    expect(url).toBe(`${MEDIA_CDN_URL}/objects/swimming/abc123-128.jpg`)
  })

  it('encodes object name with spaces', () => {
    const match = {
      objectName: 'hiking trail',
      imageHash: 'trail1',
      matchType: 'object' as const
    }
    const url = buildImageUrl(match)
    expect(url).toBe(`${MEDIA_CDN_URL}/objects/hiking%20trail/trail1-700.jpg`)
  })

  it('builds local file URL when localPath provided', () => {
    const match = { objectName: 'swimming', imageHash: 'abc123', matchType: 'object' as const }
    const url = buildImageUrl(match, 400, { localPath: '/path/to/media' })
    expect(url).toBe('file:///path/to/media/objects/swimming/abc123-400.jpg')
  })
})
