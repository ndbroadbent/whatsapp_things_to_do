/**
 * Geocoder Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * First run makes real requests and saves fixtures.
 * Subsequent runs replay from fixtures (instant, offline).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from '../scraper/test-support/http-recorder'
import type { ClassifiedActivity } from '../types'
import { lookupActivityPlace, lookupPlace } from './index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'geocoder')

describe('Geocoder Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  const getConfig = (recorder: HttpRecorder) => ({
    apiKey: process.env.GOOGLE_MAPS_API_KEY ?? 'test-key',
    defaultCountry: 'New Zealand',
    regionBias: 'nz',
    fetch: recorder.fetch
  })

  describe('lookupPlace', () => {
    it('looks up The Remarkables ski resort, not Queenstown city', async () => {
      // This is the exact query that gets built from formatLocation
      const location = 'The Remarkables, Queenstown, Otago, New Zealand'

      const result = await lookupPlace(location, getConfig(recorder))

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Places API returns the venue name separately from the formatted address
        // The name should be "The Remarkables Ski Area"
        expect(result.value.name).toMatch(/remarkables/i)

        // The placeId should be for The Remarkables, not Queenstown city
        // Queenstown city placeId: ChIJX96o1_Ed1akRAKZ5hIbvAAU
        expect(result.value.placeId).not.toBe('ChIJX96o1_Ed1akRAKZ5hIbvAAU')
        // Should have The Remarkables placeId
        expect(result.value.placeId).toBe('ChIJAR4O0_Tf1KkR9P9FTBp_iBo')
      }
    })
  })

  describe('lookupActivityPlace', () => {
    it('looks up skiing at Remarkables with correct venue placeId', async () => {
      const activity: ClassifiedActivity = {
        activityId: 'test-remarkables',
        activity: 'Skiing at Remarkables',
        funScore: 5,
        interestingScore: 4.5,
        score: 4.7,
        category: 'sports',
        messages: [
          {
            id: 22,
            timestamp: new Date('2024-03-20T20:05:00.000Z'),
            sender: 'Sophie',
            message: 'We should come back in winter for skiing at Remarkables'
          }
        ],
        wikiName: null,
        placeName: 'The Remarkables',
        placeQuery: null,
        city: 'Queenstown',
        region: 'Otago',
        country: 'New Zealand',
        image: {
          stock: 'skiing snow mountain queenstown',
          mediaKey: 'ski resort',
          preferStock: true
        },
        link: null
      }

      const result = await lookupActivityPlace(activity, getConfig(recorder))

      // Should have coordinates
      expect(result.latitude).toBeDefined()
      expect(result.longitude).toBeDefined()

      // Activities with venue use Places API, which returns venue name
      // The formattedAddress may just be the area ("Queenstown 9300")
      // but isVenuePlaceId should be true and placeId should be for the ski area
      expect(result.isVenuePlaceId).toBe(true)
      expect(result.placeLookupSource).toBe('places_api')

      // The placeId should be for The Remarkables, not Queenstown city
      // Queenstown city placeId: ChIJX96o1_Ed1akRAKZ5hIbvAAU
      // The Remarkables placeId: ChIJAR4O0_Tf1KkR9P9FTBp_iBo
      expect(result.placeId).not.toBe('ChIJX96o1_Ed1akRAKZ5hIbvAAU')
      expect(result.placeId).toBe('ChIJAR4O0_Tf1KkR9P9FTBp_iBo')
    })
  })
})
