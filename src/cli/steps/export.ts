/**
 * Export Step
 *
 * Exports geocoded activities to various formats: csv, json, map, excel, pdf.
 */

import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ImageResult } from '../../images/types'
import {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  filterActivitiesForExport,
  VERSION
} from '../../index'
import type { GeocodedActivity, ImageAttribution, MapStyle, PDFConfig } from '../../types'
import type { CLIArgs } from '../args'
import type { Config } from '../config'
import { buildFilterOptions } from '../filter-options'
import { ensureDir } from '../io'
import type { PipelineContext } from './context'

export type ExportFormat = 'csv' | 'json' | 'map' | 'excel' | 'pdf'

interface ExportOptions {
  /** Output directory for exported files */
  readonly outputDir: string
  /** Formats to export */
  readonly formats: readonly ExportFormat[]
  /** Thumbnails (128×128) keyed by activity ID for PDF and map list */
  readonly thumbnails?: Map<string, Buffer>
  /** Medium images (400×267) keyed by activity ID for map popup */
  readonly mediumImages?: Map<string, Buffer>
  /** Lightbox images (1400×933) keyed by activity ID for map lightbox */
  readonly lightboxImages?: Map<string, Buffer>
  /** Image results keyed by activity ID (for attribution) */
  readonly images?: Map<string, ImageResult | null>
  /** CLI args for building filter options per format */
  readonly args: CLIArgs
  /** Config for building filter options per format */
  readonly config: Config | null
}

/**
 * Build PDFConfig from CLI args and config.
 * Filtering is handled separately by buildFilterOptions.
 */
export function buildPdfConfig(
  args: CLIArgs,
  config: Config | null,
  inputFile: string,
  thumbnails?: Map<string, Buffer>
): PDFConfig {
  // Title: CLI arg → config → default
  const title = args.pdfTitle ?? config?.pdfTitle ?? 'Things To Do'

  // Subtitle: CLI arg → config → default from input file
  const subtitle =
    args.pdfSubtitle ?? config?.pdfSubtitle ?? `Generated from ${basename(inputFile)}`

  // Include thumbnails: CLI arg → config → false
  const includeThumbnails = args.pdfThumbnails || config?.pdfThumbnails || false

  // Group by country: CLI arg → config → true (default)
  // CLI uses negation flag, so we check if explicitly set to false
  const groupByCountry = args.pdfGroupByCountry && (config?.pdfGroupByCountry ?? true)

  // Group by category: CLI arg → config → true (default)
  const groupByCategory = args.pdfGroupByCategory && (config?.pdfGroupByCategory ?? true)

  // Include score: CLI arg → config → false
  const includeScore = args.pdfIncludeScore || config?.pdfIncludeScore || false

  // Page size: CLI arg → config → undefined (let PDF module decide based on defaults)
  const pageSize = (args.pdfPageSize ?? config?.pdfPageSize) as 'A4' | 'Letter' | undefined

  const result: PDFConfig = {
    title,
    subtitle,
    thumbnails,
    includeThumbnails,
    groupByCountry,
    groupByCategory,
    includeScore
  }

  // Only include pageSize if explicitly set (exactOptionalPropertyTypes)
  if (pageSize) {
    ;(result as { pageSize: 'A4' | 'Letter' }).pageSize = pageSize
  }

  return result
}

interface ExportResult {
  /** Paths to exported files, keyed by format */
  readonly exportedFiles: Map<ExportFormat, string>
}

/**
 * Export activities to specified formats.
 * Each format gets its own filter options (PDF can have different filters than others).
 */
export async function stepExport(
  ctx: PipelineContext,
  activities: readonly GeocodedActivity[],
  options: ExportOptions
): Promise<ExportResult> {
  const { outputDir, formats, args, config, thumbnails, mediumImages, lightboxImages, images } =
    options
  const inputFile = ctx.input

  await ensureDir(outputDir)

  const exportedFiles = new Map<ExportFormat, string>()

  // Build PDF config once (only used if PDF format requested)
  const pdfConfig = buildPdfConfig(args, config, inputFile, thumbnails)

  // Get map default style from args → config
  const mapDefaultStyle = parseMapStyle(args.mapDefaultStyle ?? config?.mapDefaultStyle)

  // Extract image attributions from ImageResult objects
  const imageAttributions = extractImageAttributions(images)

  for (const format of formats) {
    // Build filter options for this specific format (PDF can have different filters than others)
    const filter = buildFilterOptions(format, args, config)
    const filtered = filterActivitiesForExport(activities, filter)

    const path = await exportFormat(
      format,
      filtered,
      outputDir,
      inputFile,
      thumbnails,
      mediumImages,
      lightboxImages,
      imageAttributions,
      pdfConfig,
      mapDefaultStyle
    )
    if (path) {
      exportedFiles.set(format, path)
    }
  }

  return { exportedFiles }
}

/** Parse map style string to MapStyle type */
function parseMapStyle(style: string | undefined): MapStyle | undefined {
  if (style === 'osm' || style === 'satellite' || style === 'terrain') {
    return style
  }
  return undefined
}

/**
 * Extract image attributions from ImageResult objects.
 * Converts ImageResult.meta to ImageAttribution format.
 *
 * Only sources with meaningful attribution are included:
 * - wikipedia, pixabay, unsplash
 * - google_places/user_upload are excluded (no artist attribution)
 */
function extractImageAttributions(
  images: Map<string, ImageResult | null> | undefined
): Map<string, ImageAttribution> | undefined {
  if (!images || images.size === 0) return undefined

  const attributions = new Map<string, ImageAttribution>()
  for (const [activityId, result] of images) {
    if (result?.meta.attribution) {
      // Map image source to attribution source type
      // Only include sources that have meaningful artist attribution
      const source = mapToAttributionSource(result.meta.source)
      if (source) {
        attributions.set(activityId, {
          name: result.meta.attribution.name,
          photoUrl: result.meta.url, // URL to the photo/place page
          authorUrl: result.meta.attribution.url || undefined, // Empty string → undefined
          license: source === 'wikipedia' ? result.meta.license : undefined, // Only show license for Wikipedia
          source
        })
      }
    }
  }

  return attributions.size > 0 ? attributions : undefined
}

/**
 * Map ImageSource to ImageAttribution source.
 * Returns null for sources that don't require visible attribution.
 */
function mapToAttributionSource(
  source: ImageResult['meta']['source']
): ImageAttribution['source'] | null {
  switch (source) {
    case 'wikipedia':
    case 'pixabay':
    case 'unsplash':
    case 'google_places':
      return source
    case 'user_upload':
    case 'unsplash+':
      // These sources don't have artist attribution to display
      return null
    default:
      return null
  }
}

/**
 * Write images to disk and return path maps for the HTML export.
 */
async function writeMapImages(
  outputDir: string,
  thumbnails: Map<string, Buffer> | undefined,
  mediumImages: Map<string, Buffer> | undefined,
  lightboxImages: Map<string, Buffer> | undefined
): Promise<{
  thumbnailPaths: Map<string, string>
  mediumPaths: Map<string, string>
  lightboxPaths: Map<string, string>
}> {
  const thumbnailPaths = new Map<string, string>()
  const mediumPaths = new Map<string, string>()
  const lightboxPaths = new Map<string, string>()

  const hasImages =
    (thumbnails && thumbnails.size > 0) ||
    (mediumImages && mediumImages.size > 0) ||
    (lightboxImages && lightboxImages.size > 0)

  if (!hasImages) {
    return { thumbnailPaths, mediumPaths, lightboxPaths }
  }

  const imagesDir = join(outputDir, 'images')
  const thumbDir = join(imagesDir, 'thumb')
  const mediumDir = join(imagesDir, 'medium')
  const lightboxDir = join(imagesDir, 'lightbox')

  await Promise.all([ensureDir(thumbDir), ensureDir(mediumDir), ensureDir(lightboxDir)])

  // Write thumbnails (128×128)
  if (thumbnails) {
    for (const [activityId, buffer] of thumbnails) {
      const filename = `${activityId}.jpg`
      await writeFile(join(thumbDir, filename), new Uint8Array(buffer))
      thumbnailPaths.set(activityId, `images/thumb/${filename}`)
    }
  }

  // Write medium images (400×267)
  if (mediumImages) {
    for (const [activityId, buffer] of mediumImages) {
      const filename = `${activityId}.jpg`
      await writeFile(join(mediumDir, filename), new Uint8Array(buffer))
      mediumPaths.set(activityId, `images/medium/${filename}`)
    }
  }

  // Write lightbox images (1400×933)
  if (lightboxImages) {
    for (const [activityId, buffer] of lightboxImages) {
      const filename = `${activityId}.jpg`
      await writeFile(join(lightboxDir, filename), new Uint8Array(buffer))
      lightboxPaths.set(activityId, `images/lightbox/${filename}`)
    }
  }

  return { thumbnailPaths, mediumPaths, lightboxPaths }
}

/**
 * Export to map HTML format with images.
 */
async function exportMapFormat(
  activities: readonly GeocodedActivity[],
  outputDir: string,
  thumbnails: Map<string, Buffer> | undefined,
  mediumImages: Map<string, Buffer> | undefined,
  lightboxImages: Map<string, Buffer> | undefined,
  imageAttributions: Map<string, ImageAttribution> | undefined,
  mapDefaultStyle: MapStyle | undefined
): Promise<string> {
  const { thumbnailPaths, mediumPaths, lightboxPaths } = await writeMapImages(
    outputDir,
    thumbnails,
    mediumImages,
    lightboxImages
  )

  const html = exportToMapHTML(activities, {
    title: 'Things To Do',
    imagePaths: thumbnailPaths,
    mediumImagePaths: mediumPaths,
    lightboxImagePaths: lightboxPaths,
    imageAttributions,
    ...(mapDefaultStyle && { defaultStyle: mapDefaultStyle })
  })
  const mapPath = join(outputDir, 'map.html')
  await writeFile(mapPath, html)
  return mapPath
}

async function exportFormat(
  format: ExportFormat,
  activities: readonly GeocodedActivity[],
  outputDir: string,
  inputFile: string,
  thumbnails: Map<string, Buffer> | undefined,
  mediumImages: Map<string, Buffer> | undefined,
  lightboxImages: Map<string, Buffer> | undefined,
  imageAttributions: Map<string, ImageAttribution> | undefined,
  pdfConfig: PDFConfig,
  mapDefaultStyle: MapStyle | undefined
): Promise<string | null> {
  switch (format) {
    case 'csv': {
      const csv = exportToCSV(activities)
      const csvPath = join(outputDir, 'activities.csv')
      await writeFile(csvPath, csv)
      return csvPath
    }

    case 'json': {
      const metadata = {
        inputFile: basename(inputFile),
        messageCount: 0,
        version: VERSION
      }
      const json = exportToJSON(activities, metadata)
      const jsonPath = join(outputDir, 'activities.json')
      await writeFile(jsonPath, json)
      return jsonPath
    }

    case 'map':
      return exportMapFormat(
        activities,
        outputDir,
        thumbnails,
        mediumImages,
        lightboxImages,
        imageAttributions,
        mapDefaultStyle
      )

    case 'excel': {
      const excel = await exportToExcel(activities)
      const excelPath = join(outputDir, 'activities.xlsx')
      await writeFile(excelPath, excel)
      return excelPath
    }

    case 'pdf': {
      const pdf = await exportToPDF(activities, pdfConfig)
      const pdfPath = join(outputDir, 'activities.pdf')
      await writeFile(pdfPath, pdf)
      return pdfPath
    }

    default:
      return null
  }
}
