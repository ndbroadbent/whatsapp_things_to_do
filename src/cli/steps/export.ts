/**
 * Export Step
 *
 * Exports geocoded activities to various formats: csv, json, map, excel, pdf.
 */

import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  filterActivitiesForExport,
  VERSION
} from '../../index'
import type { GeocodedActivity, PDFConfig } from '../../types'
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
  /** Thumbnails keyed by activity ID for PDF export */
  readonly thumbnails?: Map<string, Buffer>
  /** CLI args for building filter options per format */
  readonly args: CLIArgs
  /** Config for building filter options per format */
  readonly config: Config | null
}

/**
 * Build PDFConfig from CLI args and config.
 * Filtering is handled separately by buildFilterOptions.
 */
function buildPdfConfig(
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
  const { outputDir, formats, args, config, thumbnails } = options
  const inputFile = ctx.input

  await ensureDir(outputDir)

  const exportedFiles = new Map<ExportFormat, string>()

  // Build PDF config once (only used if PDF format requested)
  const pdfConfig = buildPdfConfig(args, config, inputFile, thumbnails)

  for (const format of formats) {
    // Build filter options for this specific format (PDF can have different filters than others)
    const filter = buildFilterOptions(format, args, config)
    const filtered = filterActivitiesForExport(activities, filter)

    const path = await exportFormat(format, filtered, outputDir, inputFile, thumbnails, pdfConfig)
    if (path) {
      exportedFiles.set(format, path)
    }
  }

  return { exportedFiles }
}

async function exportFormat(
  format: ExportFormat,
  activities: readonly GeocodedActivity[],
  outputDir: string,
  inputFile: string,
  thumbnails: Map<string, Buffer> | undefined,
  pdfConfig: PDFConfig
): Promise<string | null> {
  switch (format) {
    case 'csv': {
      const csv = exportToCSV(activities)
      const csvPath = join(outputDir, 'activities.csv')
      await writeFile(csvPath, csv)
      return csvPath
    }

    case 'json': {
      const metadata = { inputFile: basename(inputFile), messageCount: 0, version: VERSION }
      const json = exportToJSON(activities, metadata)
      const jsonPath = join(outputDir, 'activities.json')
      await writeFile(jsonPath, json)
      return jsonPath
    }

    case 'map': {
      // Write thumbnails to images/ directory and build path map
      const imagePaths = new Map<string, string>()
      if (thumbnails && thumbnails.size > 0) {
        const imagesDir = join(outputDir, 'images')
        await ensureDir(imagesDir)
        for (const [activityId, buffer] of thumbnails) {
          const filename = `${activityId}.jpg`
          await writeFile(join(imagesDir, filename), new Uint8Array(buffer))
          imagePaths.set(activityId, `images/${filename}`)
        }
      }

      const html = exportToMapHTML(activities, { title: 'Things To Do', imagePaths })
      const mapPath = join(outputDir, 'map.html')
      await writeFile(mapPath, html)
      return mapPath
    }

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
