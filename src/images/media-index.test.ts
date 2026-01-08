import { describe, expect, it } from 'vitest'
import {
  buildImageUrl,
  findActionFallbackImage,
  findCategoryFallbackImage,
  findCountryImage,
  findObjectImage,
  MEDIA_CDN_URL,
  type MediaIndex,
  resolveEntry
} from './media-index'

/** Minimal test index for unit tests (v4 format) */
const TEST_INDEX: MediaIndex = {
  version: 4,
  generated: '2025-01-01T00:00:00.000Z',
  base_url: MEDIA_CDN_URL,
  sizes: [1400, 700, 400, 128],
  objects: {
    swimming: ['hash1', 'hash2', 'hash3'],
    'hiking trail': ['trail1', 'trail2'],
    'american football': ['football1'],
    sushi: ['sushi1', 'sushi2'],
    'cooking class': ['cook1', 'cook2']
  },
  categories: {
    fitness: ['$objects/swimming/hash1', '$objects/hiking trail/trail1'],
    food: ['$objects/sushi/sushi1'],
    nature: ['$objects/hiking trail/trail2'],
    learning: ['$objects/cooking class/cook1']
  },
  countries: {
    France: ['france1', 'france2'],
    'New Zealand': ['nz1', 'nz2', 'nz3'],
    Japan: ['japan1'],
    "Côte d'Ivoire": ['cdi1', 'cdi2']
  },
  regions: {},
  cities: {},
  venues: {},
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

describe('resolveEntry', () => {
  it('resolves direct hash', () => {
    const result = resolveEntry('abc123', 'objects', 'swimming')
    expect(result).toEqual({
      type: 'objects',
      item: 'swimming',
      hash: 'abc123'
    })
  })

  it('resolves reference to another object', () => {
    const result = resolveEntry('$objects/cooking class/cook1', 'categories', 'learning')
    expect(result).toEqual({
      type: 'objects',
      item: 'cooking class',
      hash: 'cook1'
    })
  })

  it('resolves reference with simple path', () => {
    const result = resolveEntry('$objects/sushi/sushi1', 'categories', 'food')
    expect(result).toEqual({
      type: 'objects',
      item: 'sushi',
      hash: 'sushi1'
    })
  })
})

describe('findObjectImage', () => {
  it('finds direct object match', () => {
    const result = findObjectImage('swimming', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.entityType).toBe('objects')
    expect(result?.itemName).toBe('swimming')
    expect(result?.matchType).toBe('object')
    expect(['hash1', 'hash2', 'hash3']).toContain(result?.resolved.hash)
  })

  it('finds object with spaces', () => {
    const result = findObjectImage('hiking trail', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('hiking trail')
    expect(result?.matchType).toBe('object')
  })

  it('normalizes underscores to spaces', () => {
    const result = findObjectImage('hiking_trail', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('hiking trail')
  })

  it('finds synonym match', () => {
    const result = findObjectImage('bushwalk', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('hiking trail')
    expect(result?.matchType).toBe('synonym')
  })

  it('finds synonym match case-insensitive', () => {
    const result = findObjectImage('Go Swimming', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('swimming')
    expect(result?.matchType).toBe('synonym')
  })

  it('returns null for unknown object', () => {
    const result = findObjectImage('skydiving', TEST_INDEX)
    expect(result).toBeNull()
  })

  it('applies regional override for US', () => {
    const result = findObjectImage('football', TEST_INDEX, {
      countryCode: 'US'
    })
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('american football')
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
    expect(result?.itemName).toBe('swimming')
    expect(result?.matchType).toBe('action')
  })

  it('finds action verb case-insensitive', () => {
    const result = findActionFallbackImage('HIKE', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('hiking trail')
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
  it('finds category fallback with reference', () => {
    const result = findCategoryFallbackImage('fitness', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.entityType).toBe('categories')
    expect(result?.itemName).toBe('fitness')
    expect(result?.matchType).toBe('category')
    // Resolved should point to the actual object
    expect(result?.resolved.type).toBe('objects')
    expect(['swimming', 'hiking trail']).toContain(result?.resolved.item)
  })

  it('returns null for unknown category', () => {
    const result = findCategoryFallbackImage('entertainment', TEST_INDEX)
    expect(result).toBeNull()
  })

  it('returns null for category with empty entries', () => {
    const indexWithEmptyCategory: MediaIndex = {
      ...TEST_INDEX,
      categories: { ...TEST_INDEX.categories, empty: [] }
    }
    const result = findCategoryFallbackImage('empty', indexWithEmptyCategory)
    expect(result).toBeNull()
  })
})

describe('findCountryImage', () => {
  it('finds country by exact name', () => {
    const result = findCountryImage('France', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.entityType).toBe('countries')
    expect(result?.itemName).toBe('France')
    expect(result?.matchType).toBe('country')
    expect(['france1', 'france2']).toContain(result?.resolved.hash)
  })

  it('finds country with spaces', () => {
    const result = findCountryImage('New Zealand', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe('New Zealand')
    expect(['nz1', 'nz2', 'nz3']).toContain(result?.resolved.hash)
  })

  it('finds country case-insensitive', () => {
    const result = findCountryImage('JAPAN', TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.resolved.hash).toBe('japan1')
  })

  it('finds country with lowercase input', () => {
    const result = findCountryImage('france', TEST_INDEX)
    expect(result).not.toBeNull()
  })

  it('returns null for unknown country', () => {
    const result = findCountryImage('Atlantis', TEST_INDEX)
    expect(result).toBeNull()
  })

  it('matches country with diacritics removed', () => {
    const result = findCountryImage("cote d'ivoire", TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe("Côte d'Ivoire")
    expect(['cdi1', 'cdi2']).toContain(result?.resolved.hash)
  })

  it('matches country with different diacritics', () => {
    const result = findCountryImage("Cote d'Ivoire", TEST_INDEX)
    expect(result).not.toBeNull()
    expect(result?.itemName).toBe("Côte d'Ivoire")
  })
})

describe('buildImageUrl', () => {
  it('builds CDN URL with default size', () => {
    const match = findObjectImage('swimming', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match)
    expect(url).toMatch(new RegExp(`^${MEDIA_CDN_URL}/objects/swimming/hash[123]-700\\.jpg$`))
  })

  it('builds CDN URL with specified size', () => {
    const match = findObjectImage('swimming', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match, 128)
    expect(url).toMatch(new RegExp(`^${MEDIA_CDN_URL}/objects/swimming/hash[123]-128\\.jpg$`))
  })

  it('encodes object name with spaces', () => {
    const match = findObjectImage('hiking trail', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match)
    expect(url).toMatch(/hiking%20trail/)
  })

  it('builds local file URL when localPath provided', () => {
    const match = findObjectImage('swimming', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match, 400, { localPath: '/path/to/media' })
    expect(url).toMatch(/^file:\/\/\/path\/to\/media\/objects\/swimming\/hash[123]-400\.jpg$/)
  })

  it('builds URL for category with reference (resolves to object)', () => {
    const match = findCategoryFallbackImage('food', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match)
    // Reference $objects/sushi/sushi1 should resolve to objects/sushi path
    expect(url).toBe(`${MEDIA_CDN_URL}/objects/sushi/sushi1-700.jpg`)
  })

  it('builds URL for country', () => {
    const match = findCountryImage('France', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match)
    expect(url).toMatch(new RegExp(`^${MEDIA_CDN_URL}/countries/France/france[12]-700\\.jpg$`))
  })

  it('supports 1400 size', () => {
    const match = findObjectImage('swimming', TEST_INDEX)
    if (!match) throw new Error('Expected match')
    const url = buildImageUrl(match, 1400)
    expect(url).toMatch(/-1400\.jpg$/)
  })
})
