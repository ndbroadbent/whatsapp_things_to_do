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
import { formatDate } from './utils'

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

/**
 * Group activities by country for organized display.
 */
function groupByCountry(activities: readonly GeocodedActivity[]): Map<string, GeocodedActivity[]> {
  const groups = new Map<string, GeocodedActivity[]>()

  for (const a of activities) {
    const country = a.country ?? 'General'
    const existing = groups.get(country) ?? []
    existing.push(a)
    groups.set(country, existing)
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

interface RenderOptions {
  /** Show thumbnail if available */
  readonly includeThumbnails: boolean
  /** Show score in details */
  readonly includeScore: boolean
  /** Show category in details (when not grouped by category) */
  readonly showCategory: boolean
  /** Show country in details (when not grouped by country) */
  readonly showCountry: boolean
}

/**
 * Render a single activity item with optional thumbnail.
 */
function renderActivityItem(
  doc: PDFKit.PDFDocument,
  item: GeocodedActivity,
  thumbnail: Buffer | undefined,
  options: RenderOptions
): void {
  const startY = doc.y
  const showThumbnail = options.includeThumbnails && thumbnail
  const textX = showThumbnail ? 50 + THUMBNAIL_WIDTH + 8 : 50
  const textWidth = 500 - (showThumbnail ? THUMBNAIL_WIDTH + 8 : 0)

  // Build details string
  const details: string[] = []
  const location = formatLocation(item)
  if (location) {
    details.push(`Location: ${location}`)
  }
  if (options.showCountry && item.country) {
    details.push(`Country: ${item.country}`)
  }
  if (options.showCategory) {
    details.push(`Category: ${CATEGORY_NAMES[item.category]}`)
  }
  const firstMessage = item.messages[0]
  const senderName = firstMessage?.sender.split(' ')[0] ?? 'Unknown'
  const dateStr = firstMessage ? formatDate(firstMessage.timestamp) : ''
  const mentionCount = item.messages.length
  const mentionSuffix = mentionCount > 1 ? ` (${mentionCount} mentions)` : ''
  details.push(`From: ${senderName} on ${dateStr}${mentionSuffix}`)
  if (options.includeScore) {
    details.push(`Score: ${item.score.toFixed(1)}`)
  }
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
  const textY = showThumbnail ? startY + offset : startY

  // Render thumbnail if available and enabled
  if (showThumbnail) {
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
  if (showThumbnail && doc.y < startY + THUMBNAIL_HEIGHT + 4) {
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
 * Render a list of activities with pagination.
 */
function renderActivityList(
  doc: PDFKit.PDFDocument,
  items: readonly GeocodedActivity[],
  config: PDFConfig,
  renderOptions: RenderOptions,
  sortBy: 'confidence' | 'score' = 'confidence'
): void {
  const sorted =
    sortBy === 'confidence'
      ? [...items].sort((a, b) => b.confidence - a.confidence)
      : [...items].sort((a, b) => b.score - a.score)

  for (const item of sorted) {
    const hasThumbnail = config.thumbnails?.has(item.activityId)
    const rowHeight = hasThumbnail && renderOptions.includeThumbnails ? THUMBNAIL_HEIGHT + 8 : 40
    if (doc.y > 750 - rowHeight) doc.addPage()

    const thumbnail = config.thumbnails?.get(item.activityId)
    renderActivityItem(doc, item, thumbnail, renderOptions)
  }
}

/**
 * Render activities as a flat list (no grouping).
 */
function renderFlatList(
  doc: PDFKit.PDFDocument,
  activities: readonly GeocodedActivity[],
  config: PDFConfig,
  renderOptions: RenderOptions
): void {
  doc.moveDown(2)
  renderActivityList(doc, activities, config, renderOptions, 'score')
}

/**
 * Render a category section with heading.
 */
function renderCategorySection(
  doc: PDFKit.PDFDocument,
  category: ActivityCategory,
  items: readonly GeocodedActivity[],
  config: PDFConfig,
  renderOptions: RenderOptions,
  options: { moveDown: number; fontSize: number }
): void {
  if (doc.y > 700) doc.addPage()

  doc.moveDown(options.moveDown)
  doc.x = 50 // Reset to left margin (thumbnails shift X position)
  doc
    .fontSize(options.fontSize)
    .font('Helvetica-Bold')
    .fillColor('#000000')
    .text(`${CATEGORY_NAMES[category]} (${items.length})`)
  doc.moveDown(0.5)

  renderActivityList(doc, items, config, renderOptions, 'confidence')
}

/**
 * Render activities grouped by category only.
 */
function renderGroupedByCategory(
  doc: PDFKit.PDFDocument,
  activities: readonly GeocodedActivity[],
  config: PDFConfig,
  renderOptions: RenderOptions
): void {
  const grouped = groupByCategory(activities)

  for (const category of VALID_CATEGORIES) {
    const items = grouped.get(category)
    if (!items || items.length === 0) continue

    renderCategorySection(doc, category, items, config, renderOptions, {
      moveDown: 1.5,
      fontSize: 14
    })
  }
}

/**
 * Render a horizontal divider line.
 */
function renderDivider(doc: PDFKit.PDFDocument): void {
  const y = doc.y + 32
  doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(50, y).lineTo(545, y).stroke()
  doc.y = y + 8
}

/**
 * Render a country section with heading and divider.
 */
function renderCountrySection(
  doc: PDFKit.PDFDocument,
  country: string,
  items: readonly GeocodedActivity[],
  _config: PDFConfig,
  _renderOptions: RenderOptions,
  options: { fontSize: number; renderContent: () => void }
): void {
  if (doc.y > 680) doc.addPage()

  renderDivider(doc)

  doc.moveDown(0.5)
  doc.x = 50 // Reset to left margin (thumbnails shift X position)
  doc
    .fontSize(options.fontSize)
    .font('Helvetica-Bold')
    .fillColor('#000000')
    .text(`${country} (${items.length})`)

  options.renderContent()
}

/**
 * Render activities grouped by country only.
 */
function renderGroupedByCountry(
  doc: PDFKit.PDFDocument,
  activities: readonly GeocodedActivity[],
  config: PDFConfig,
  renderOptions: RenderOptions
): void {
  const grouped = groupByCountry(activities)

  for (const country of [...grouped.keys()].sort()) {
    const items = grouped.get(country)
    if (!items || items.length === 0) continue

    renderCountrySection(doc, country, items, config, renderOptions, {
      fontSize: 16,
      renderContent: () => {
        doc.moveDown(0.5)
        renderActivityList(doc, items, config, renderOptions, 'score')
      }
    })
  }
}

/**
 * Render activities grouped by country, then by category within each country.
 */
function renderGroupedByCountryAndCategory(
  doc: PDFKit.PDFDocument,
  activities: readonly GeocodedActivity[],
  config: PDFConfig,
  renderOptions: RenderOptions
): void {
  const byCountry = groupByCountry(activities)

  for (const country of [...byCountry.keys()].sort()) {
    const countryItems = byCountry.get(country)
    if (!countryItems || countryItems.length === 0) continue

    const byCategory = groupByCategory(countryItems)

    renderCountrySection(doc, country, countryItems, config, renderOptions, {
      fontSize: 18,
      renderContent: () => {
        for (const category of VALID_CATEGORIES) {
          const items = byCategory.get(category)
          if (!items || items.length === 0) continue

          renderCategorySection(doc, category, items, config, renderOptions, {
            moveDown: 1,
            fontSize: 14
          })
        }
      }
    })
  }
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
  let filtered = [...activities]
  if (config.filterByCategory && config.filterByCategory.length > 0) {
    const allowedCategories = new Set(config.filterByCategory)
    filtered = filtered.filter((a) => allowedCategories.has(a.category))
  }

  // Filter by country if specified
  if (config.filterByCountry && config.filterByCountry.length > 0) {
    const allowedCountries = new Set(config.filterByCountry.map((c) => c.toLowerCase()))
    filtered = filtered.filter((a) => a.country && allowedCountries.has(a.country.toLowerCase()))
  }

  // Sort and limit if maxActivities is set
  if (config.maxActivities && config.maxActivities > 0 && filtered.length > config.maxActivities) {
    filtered = [...filtered].sort((a, b) => b.score - a.score).slice(0, config.maxActivities)
  }

  // Count statistics
  const stats = {
    total: filtered.length,
    geocoded: filtered.filter((a) => a.latitude !== undefined && a.longitude !== undefined).length,
    senders: new Set(filtered.flatMap((a) => a.messages.map((m) => m.sender))).size
  }

  // Determine grouping options (default to true for both)
  const doGroupByCountry = config.groupByCountry ?? true
  const doGroupByCategory = config.groupByCategory ?? true

  // Create PDF document with configured page size
  const doc = new PDF({
    size: config.pageSize ?? 'A4',
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

  // Build render options based on grouping mode
  const renderOptions: RenderOptions = {
    includeThumbnails: config.includeThumbnails ?? false,
    includeScore: config.includeScore ?? false,
    showCategory: !doGroupByCategory,
    showCountry: !doGroupByCountry
  }

  // Render activities based on grouping configuration
  if (doGroupByCountry && doGroupByCategory) {
    renderGroupedByCountryAndCategory(doc, filtered, config, renderOptions)
  } else if (doGroupByCountry) {
    renderGroupedByCountry(doc, filtered, config, renderOptions)
  } else if (doGroupByCategory) {
    renderGroupedByCategory(doc, filtered, config, renderOptions)
  } else {
    renderFlatList(doc, filtered, config, renderOptions)
  }

  doc.end()
  return docFinished
}
