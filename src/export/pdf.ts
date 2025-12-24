/**
 * PDF Export
 *
 * Export activities to PDF format using pdfkit.
 * This is an optional feature - if pdfkit is not available, it throws a clear error.
 */

import {
  type ActivityCategory,
  formatLocation,
  type GeocodedActivity,
  type PDFConfig,
  VALID_CATEGORIES
} from '../types'

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
 * Group activities by category for organized display.
 */
function groupByCategory(
  activities: readonly GeocodedActivity[]
): Map<ActivityCategory, GeocodedActivity[]> {
  const groups = new Map<ActivityCategory, GeocodedActivity[]>()

  for (const a of activities) {
    const existing = groups.get(a.category) ?? []
    existing.push(a)
    groups.set(a.category, existing)
  }

  return groups
}

/** Thumbnail size in PDF points (0.5" at 72 DPI) */
const THUMBNAIL_WIDTH = 36
const THUMBNAIL_HEIGHT = 36

/**
 * Category display names.
 */
const CATEGORY_NAMES: Record<ActivityCategory, string> = {
  food: 'Food',
  nightlife: 'Nightlife',
  nature: 'Nature',
  arts: 'Arts',
  culture: 'Culture',
  music: 'Music',
  entertainment: 'Entertainment',
  events: 'Events',
  sports: 'Sports',
  fitness: 'Fitness',
  wellness: 'Wellness',
  shopping: 'Shopping',
  travel: 'Travel',
  experiences: 'Experiences',
  hobbies: 'Hobbies',
  gaming: 'Gaming',
  learning: 'Learning',
  home: 'Home',
  work: 'Work',
  social: 'Social',
  family: 'Family',
  pets: 'Pets',
  other: 'Other'
}

/**
 * Render a single activity item with optional thumbnail.
 */
function renderActivityItem(
  doc: PDFKit.PDFDocument,
  item: GeocodedActivity,
  thumbnail: Buffer | undefined
): void {
  const startY = doc.y
  const textX = thumbnail ? 50 + THUMBNAIL_WIDTH + 8 : 50
  const textWidth = 500 - (thumbnail ? THUMBNAIL_WIDTH + 8 : 0)

  // Build details string
  const details: string[] = []
  const location = formatLocation(item)
  if (location) {
    details.push(`Location: ${location}`)
  }
  details.push(`From: ${item.sender.split(' ')[0]} on ${formatDate(item.timestamp)}`)
  const detailsText = details.join(' | ')

  // Calculate text height for vertical centering
  const titleHeight = doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .heightOfString(item.activity.slice(0, 80), { width: textWidth })
  const detailsHeight = doc
    .fontSize(9)
    .font('Helvetica')
    .heightOfString(detailsText, { width: textWidth })
  const totalTextHeight = titleHeight + detailsHeight
  // Center text vertically with thumbnail, nudged down slightly
  const offset = (THUMBNAIL_HEIGHT - totalTextHeight) / 2 + 2
  const textY = thumbnail ? startY + offset : startY

  // Render thumbnail if available
  if (thumbnail) {
    doc.image(thumbnail, 50, startY, {
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT
    })
  }

  // Render activity text (capitalize first letter)
  const activityTitle = item.activity.charAt(0).toUpperCase() + item.activity.slice(1)
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#000000')
    .text(activityTitle.slice(0, 80), textX, textY, { width: textWidth })

  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#666666')
    .text(detailsText, textX, doc.y, { width: textWidth })

  // Move past thumbnail if it's taller than text
  if (thumbnail && doc.y < startY + THUMBNAIL_HEIGHT + 4) {
    doc.y = startY + THUMBNAIL_HEIGHT + 4
  }

  doc.moveDown(0.5)
}

/**
 * Render PDF header with title, subtitle, and summary stats.
 */
function renderHeader(
  doc: PDFKit.PDFDocument,
  config: PDFConfig,
  stats: { total: number; geocoded: number; senders: number }
): void {
  // Title
  doc
    .fontSize(24)
    .font('Helvetica-Bold')
    .text(config.title ?? 'Things To Do', { align: 'center' })

  if (config.subtitle) {
    doc.moveDown(0.5).fontSize(14).font('Helvetica').text(config.subtitle, { align: 'center' })
  }

  // Summary stats
  doc.moveDown(1)
  doc.fontSize(12).font('Helvetica-Bold').text('Summary')
  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Total activities: ${stats.total}`)
    .text(`With map locations: ${stats.geocoded}`)
    .text(`Contributors: ${stats.senders}`)
    .text(`Generated: ${new Date().toLocaleDateString()}`)
}

/**
 * Export activities to PDF format.
 *
 * @param activities Geocoded activities to export
 * @param config PDF configuration options
 * @returns PDF file as Uint8Array
 */
export async function exportToPDF(
  activities: readonly GeocodedActivity[],
  config: PDFConfig = {}
): Promise<Uint8Array> {
  const PDF = await loadPDFKit()

  // Filter by category if specified
  let filtered = activities
  if (config.filterByCategory && config.filterByCategory.length > 0) {
    const allowedCategories = new Set(config.filterByCategory)
    filtered = activities.filter((a) => allowedCategories.has(a.category))
  }

  // Group by category
  const grouped = groupByCategory(filtered)

  // Count statistics
  const stats = {
    total: filtered.length,
    geocoded: filtered.filter((a) => a.latitude !== undefined && a.longitude !== undefined).length,
    senders: new Set(filtered.map((a) => a.sender)).size
  }

  // Create PDF document
  const doc = new PDF({
    size: 'A4',
    margin: 50,
    info: {
      Title: config.title ?? 'ChatToMap Activities',
      Author: 'ChatToMap',
      Subject: 'Activities from chat messages'
    }
  })

  // Collect chunks in a buffer
  const chunks: Uint8Array[] = []
  doc.on('data', (chunk: Buffer) => {
    chunks.push(new Uint8Array(chunk))
  })

  const docFinished = new Promise<Uint8Array>((resolve) => {
    doc.on('end', () => {
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

  // Render header
  renderHeader(doc, config, stats)

  // Render categories
  const categoryOrder: ActivityCategory[] = [...VALID_CATEGORIES]

  for (const category of categoryOrder) {
    const items = grouped.get(category)
    if (!items || items.length === 0) continue

    if (doc.y > 700) doc.addPage()

    doc.moveDown(1.5)
    doc.fontSize(14).font('Helvetica-Bold').text(`${CATEGORY_NAMES[category]} (${items.length})`)
    doc.moveDown(0.5)

    const sortedItems = [...items].sort((a, b) => b.confidence - a.confidence)

    for (const item of sortedItems) {
      const hasThumbnail = config.thumbnails?.has(item.activityId)
      const rowHeight = hasThumbnail ? Math.max(THUMBNAIL_HEIGHT + 8, 40) : 40
      if (doc.y > 750 - rowHeight) doc.addPage()

      const thumbnail = config.thumbnails?.get(item.activityId)
      renderActivityItem(doc, item, thumbnail)
    }
  }

  doc.end()
  return docFinished
}
