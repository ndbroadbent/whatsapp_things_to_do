/**
 * Excel Export
 *
 * Export activities to Excel format using exceljs.
 * This is an optional feature - if exceljs is not available, it throws a clear error.
 */

import { formatLocation, type GeocodedActivity } from '../types'
import { formatDate, googleMapsLink } from './utils'

// Try to import exceljs dynamically since it's a peer dependency
let ExcelJS: typeof import('exceljs') | null = null

async function loadExcelJS(): Promise<typeof import('exceljs')> {
  if (ExcelJS) {
    return ExcelJS
  }

  try {
    ExcelJS = await import('exceljs')
    return ExcelJS
  } catch {
    throw new Error('exceljs is required for Excel export. Install it with: bun add exceljs')
  }
}

/**
 * Export activities to Excel format.
 *
 * @param activities Geocoded activities to export
 * @returns Excel file as Uint8Array
 */
export async function exportToExcel(activities: readonly GeocodedActivity[]): Promise<Uint8Array> {
  const exceljs = await loadExcelJS()

  const workbook = new exceljs.Workbook()
  workbook.creator = 'ChatToMap'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Activities')

  // Define columns with headers and widths
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Sender', key: 'sender', width: 15 },
    { header: 'Activity', key: 'activity', width: 40 },
    { header: 'Location', key: 'location', width: 25 },
    { header: 'Original Message', key: 'message', width: 50 },
    { header: 'Latitude', key: 'latitude', width: 12 },
    { header: 'Longitude', key: 'longitude', width: 12 },
    { header: 'Score', key: 'score', width: 12 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Map Link', key: 'map_link', width: 45 },
    { header: 'Mentions', key: 'mentions', width: 10 },
    { header: 'Status', key: 'status', width: 10 }
  ]

  // Style header row
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  }

  // Add data rows
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i]
    if (!a) continue

    const mapLink = googleMapsLink(a.latitude, a.longitude)
    const firstMessage = a.messages[0]

    const row = worksheet.addRow({
      id: i + 1,
      date: formatDate(firstMessage?.timestamp),
      sender: firstMessage?.sender ?? '',
      activity: a.activity,
      location: formatLocation(a) ?? '',
      message: firstMessage?.message.replace(/\n/g, ' ').slice(0, 300) ?? '',
      latitude: a.latitude ?? '',
      longitude: a.longitude ?? '',
      score: a.score,
      category: a.category,
      map_link: mapLink,
      mentions: a.messages.length,
      status: 'pending'
    })

    // Add hyperlink to map link cell
    if (mapLink) {
      const mapLinkCell = row.getCell('map_link')
      mapLinkCell.value = {
        text: mapLink,
        hyperlink: mapLink
      }
      mapLinkCell.font = { color: { argb: 'FF0000FF' }, underline: true }
    }

    // Conditional formatting for score (0-5 scale)
    const scoreCell = row.getCell('score')
    const score = a.score
    if (score >= 4) {
      scoreCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' } // Light green
      }
    } else if (score >= 3) {
      scoreCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFE0' } // Light yellow
      }
    } else {
      scoreCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCCCB' } // Light red
      }
    }
  }

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()

  return new Uint8Array(buffer)
}
