/**
 * PDF Export
 *
 * Export suggestions to PDF format using pdfkit.
 * This is an optional feature - if pdfkit is not available, it throws a clear error.
 */

import {
  type ActivityCategory,
  formatLocation,
  type GeocodedSuggestion,
  type PDFConfig
} from '../types.js'

// PDFKit uses CommonJS exports, so we need to handle it carefully
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type PDFDocumentClass = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument

async function loadPDFKit(): Promise<PDFDocumentClass> {
  try {
    const pdfkit = await import('pdfkit')
    // pdfkit exports the PDFDocument class as default
    return pdfkit.default
  } catch {
    throw new Error('pdfkit is required for PDF export. Install it with: bun add pdfkit')
  }
}

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? ''
}

/**
 * Group suggestions by category for organized display.
 */
function groupByCategory(
  suggestions: readonly GeocodedSuggestion[]
): Map<ActivityCategory, GeocodedSuggestion[]> {
  const groups = new Map<ActivityCategory, GeocodedSuggestion[]>()

  for (const s of suggestions) {
    const existing = groups.get(s.category) ?? []
    existing.push(s)
    groups.set(s.category, existing)
  }

  return groups
}

/**
 * Category display names.
 */
const CATEGORY_NAMES: Record<ActivityCategory, string> = {
  restaurant: 'Restaurants',
  cafe: 'Cafes',
  bar: 'Bars',
  hike: 'Hiking',
  nature: 'Nature',
  beach: 'Beaches',
  trip: 'Trips',
  hotel: 'Accommodation',
  event: 'Events',
  concert: 'Concerts',
  museum: 'Museums',
  entertainment: 'Entertainment',
  adventure: 'Adventure',
  family: 'Family Activities',
  errand: 'Errands',
  appointment: 'Appointments',
  other: 'Other'
}

/**
 * Export suggestions to PDF format.
 *
 * @param suggestions Geocoded suggestions to export
 * @param config PDF configuration options
 * @returns PDF file as Uint8Array
 */
export async function exportToPDF(
  suggestions: readonly GeocodedSuggestion[],
  config: PDFConfig = {}
): Promise<Uint8Array> {
  const PDF = await loadPDFKit()

  // Filter by category if specified
  let filtered = suggestions
  if (config.filterByCategory && config.filterByCategory.length > 0) {
    const allowedCategories = new Set(config.filterByCategory)
    filtered = suggestions.filter((s) => allowedCategories.has(s.category))
  }

  // Group by category
  const grouped = groupByCategory(filtered)

  // Count statistics
  const totalSuggestions = filtered.length
  const geocodedCount = filtered.filter(
    (s) => s.latitude !== undefined && s.longitude !== undefined
  ).length
  const uniqueSenders = new Set(filtered.map((s) => s.sender)).size

  // Create PDF document
  const doc = new PDF({
    size: 'A4',
    margin: 50,
    info: {
      Title: config.title ?? 'ChatToMap Suggestions',
      Author: 'ChatToMap',
      Subject: 'Activity suggestions from chat messages'
    }
  })

  // Collect chunks in a buffer
  const chunks: Uint8Array[] = []

  doc.on('data', (chunk: Buffer) => {
    chunks.push(new Uint8Array(chunk))
  })

  const docFinished = new Promise<Uint8Array>((resolve) => {
    doc.on('end', () => {
      // Combine all chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      resolve(result)
    })
  })

  // Title
  doc
    .fontSize(24)
    .font('Helvetica-Bold')
    .text(config.title ?? 'Things To Do', {
      align: 'center'
    })

  if (config.subtitle) {
    doc.moveDown(0.5).fontSize(14).font('Helvetica').text(config.subtitle, {
      align: 'center'
    })
  }

  // Summary stats
  doc.moveDown(1)
  doc.fontSize(12).font('Helvetica-Bold').text('Summary')
  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Total suggestions: ${totalSuggestions}`)
    .text(`With map locations: ${geocodedCount}`)
    .text(`Contributors: ${uniqueSenders}`)
    .text(`Generated: ${new Date().toLocaleDateString()}`)

  // Categories
  const categoryOrder: ActivityCategory[] = [
    'restaurant',
    'cafe',
    'bar',
    'hike',
    'nature',
    'beach',
    'trip',
    'hotel',
    'event',
    'concert',
    'museum',
    'entertainment',
    'adventure',
    'family',
    'other',
    'errand',
    'appointment'
  ]

  for (const category of categoryOrder) {
    const items = grouped.get(category)
    if (!items || items.length === 0) continue

    // Add page break if needed
    if (doc.y > 700) {
      doc.addPage()
    }

    doc.moveDown(1.5)
    doc.fontSize(14).font('Helvetica-Bold').text(`${CATEGORY_NAMES[category]} (${items.length})`)
    doc.moveDown(0.5)

    // Sort by confidence descending
    const sortedItems = [...items].sort((a, b) => b.confidence - a.confidence)

    for (const item of sortedItems) {
      // Add page break if needed
      if (doc.y > 720) {
        doc.addPage()
      }

      doc.fontSize(10).font('Helvetica-Bold').text(item.activity.slice(0, 80))

      const details: string[] = []
      const location = formatLocation(item)
      if (location) {
        details.push(`Location: ${location}`)
      }
      details.push(`From: ${item.sender.split(' ')[0]} on ${formatDate(item.timestamp)}`)

      if (item.latitude !== undefined && item.longitude !== undefined) {
        details.push(`Coordinates: ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`)
      }

      doc.fontSize(9).font('Helvetica').fillColor('#666666').text(details.join(' | '))

      doc.moveDown(0.5)
    }
  }

  // Finalize PDF
  doc.end()

  return docFinished
}
