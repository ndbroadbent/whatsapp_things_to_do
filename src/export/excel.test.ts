import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGeocodedActivity as createTestGeo } from '../test-support'
import type { GeocodedActivity } from '../types'

// Mock exceljs before importing
const mockAddRow = vi.fn().mockReturnValue({
  getCell: vi.fn().mockReturnValue({
    value: null as unknown,
    font: {},
    fill: {}
  })
})

const mockWorksheet = {
  columns: null as unknown,
  views: null as unknown,
  getRow: vi.fn().mockReturnValue({
    font: {},
    fill: {}
  }),
  addRow: mockAddRow
}

const mockWorkbook = {
  creator: '',
  created: null as Date | null,
  addWorksheet: vi.fn().mockReturnValue(mockWorksheet),
  xlsx: {
    writeBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-excel'))
  }
}

vi.mock('exceljs', () => ({
  Workbook: vi.fn().mockImplementation(() => mockWorkbook)
}))

function createActivity(
  id: number,
  activity: string,
  lat?: number,
  lng?: number
): GeocodedActivity {
  return createTestGeo({
    messageId: id,
    activity,
    category: 'food',
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    latitude: lat,
    longitude: lng,
    city: lat ? 'Test Location' : null
  })
}

describe('Excel Export', () => {
  describe('exportToExcel', async () => {
    // Import after mock is set up
    const { exportToExcel } = await import('./excel')

    beforeEach(() => {
      vi.clearAllMocks()
      mockWorkbook.creator = ''
      mockWorkbook.created = null
      mockWorksheet.columns = null
      mockWorksheet.views = null
    })

    it('creates a workbook with correct metadata', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockWorkbook.creator).toBe('ChatToMap')
      expect(mockWorkbook.created).toBeInstanceOf(Date)
    })

    it('creates a worksheet named Activities', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Activities')
    })

    it('sets up columns with correct headers', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockWorksheet.columns).toBeDefined()
      expect(mockWorksheet.columns).toContainEqual(expect.objectContaining({ header: 'ID' }))
      expect(mockWorksheet.columns).toContainEqual(expect.objectContaining({ header: 'Activity' }))
      expect(mockWorksheet.columns).toContainEqual(expect.objectContaining({ header: 'Location' }))
      expect(mockWorksheet.columns).toContainEqual(expect.objectContaining({ header: 'Latitude' }))
      expect(mockWorksheet.columns).toContainEqual(expect.objectContaining({ header: 'Longitude' }))
    })

    it('styles the header row', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockWorksheet.getRow).toHaveBeenCalledWith(1)
    })

    it('adds data rows for each activity', async () => {
      const activities = [
        createActivity(1, 'Place One', 41.9, 12.5),
        createActivity(2, 'Place Two', 40.7, -74.0)
      ]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledTimes(2)
    })

    it('includes activity data in rows', async () => {
      const activities = [createActivity(1, 'Italian Restaurant', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'Italian Restaurant',
          latitude: 41.9,
          longitude: 12.5
        })
      )
    })

    it('uses 1-indexed IDs', async () => {
      const activities = [createActivity(42, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    })

    it('handles missing coordinates', async () => {
      const activities = [createActivity(1, 'No coords')]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: '',
          longitude: ''
        })
      )
    })

    it('handles missing location', async () => {
      const activities = [createActivity(1, 'No location')]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          location: ''
        })
      )
    })

    it('includes Google Maps link when coordinates present', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          map_link: 'https://www.google.com/maps?q=41.9,12.5'
        })
      )
    })

    it('truncates long messages', async () => {
      const longMessage = 'A'.repeat(600)
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Test', 41.9, 12.5),
        originalMessage: longMessage
      }

      await exportToExcel([activity])

      const call = mockAddRow.mock.calls[0] as [{ message: string }]
      expect(call[0].message.length).toBeLessThanOrEqual(300)
    })

    it('replaces newlines in messages', async () => {
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Test', 41.9, 12.5),
        originalMessage: 'Line 1\nLine 2'
      }

      await exportToExcel([activity])

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Line 1 Line 2'
        })
      )
    })

    it('freezes the header row', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockWorksheet.views).toEqual([{ state: 'frozen', ySplit: 1 }])
    })

    it('returns Uint8Array buffer', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const result = await exportToExcel(activities)

      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('handles empty activities array', async () => {
      const result = await exportToExcel([])

      expect(result).toBeInstanceOf(Uint8Array)
      expect(mockAddRow).not.toHaveBeenCalled()
    })

    it('formats date correctly', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2025-01-15'
        })
      )
    })

    it('includes confidence', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 0.9
        })
      )
    })

    it('includes category', async () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      await exportToExcel(activities)

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'food'
        })
      )
    })
  })
})
