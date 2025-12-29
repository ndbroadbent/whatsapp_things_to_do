/**
 * Export Command
 *
 * Runs the full pipeline and exports to a single format.
 * Used by: export pdf, export json, export csv, export excel, export map
 */

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  filterActivitiesForExport,
  VERSION
} from '../../index'
import type { GeocodedActivity, MapStyle } from '../../types'
import type { CLIArgs } from '../args'
import { buildFilterOptions } from '../filter-options'
import { initCommandContext } from '../helpers'
import { ensureDir } from '../io'
import type { Logger } from '../logger'
import { buildPdfConfig } from '../steps/export'
import { StepRunner } from '../steps/runner'

function getDefaultFilename(format: string): string {
  switch (format) {
    case 'pdf':
      return 'activities.pdf'
    case 'json':
      return 'activities.json'
    case 'csv':
      return 'activities.csv'
    case 'excel':
      return 'activities.xlsx'
    case 'map':
      return 'map.html'
    default:
      return `activities.${format}`
  }
}

export async function cmdExport(args: CLIArgs, logger: Logger): Promise<void> {
  const format = args.exportFormat
  if (!format) {
    logger.error('No export format specified')
    process.exit(1)
  }

  const { ctx, config } = await initCommandContext(`Export ${format.toUpperCase()}`, args, logger)

  const runner = new StepRunner(ctx, args, config, logger)

  // Run pipeline through fetch-images to get thumbnails for PDF
  const needsThumbnails = format === 'pdf' && args.pdfThumbnails
  let thumbnails: Map<string, Buffer> | undefined

  let geocoded: readonly GeocodedActivity[]

  if (needsThumbnails) {
    const result = await runner.run('fetchImages')
    thumbnails = result.thumbnails
    // Get place lookup activities from the runner
    const placeLookupResult = await runner.run('placeLookup')
    geocoded = placeLookupResult.activities
  } else {
    // Just run through place lookup step
    const result = await runner.run('placeLookup')
    geocoded = result.activities
  }

  if (geocoded.length === 0) {
    logger.error('No activities to export')
    process.exit(1)
  }

  // Build filter options for this format
  const filterOptions = buildFilterOptions(
    format as 'pdf' | 'json' | 'csv' | 'excel' | 'map',
    args,
    config
  )
  const filtered = filterActivitiesForExport(geocoded, filterOptions)

  if (filtered.length === 0) {
    logger.log('⚠️  No activities match the filter criteria')
  }

  // Determine output path (use --output if provided, otherwise outputDir + default filename)
  const outputPath = args.exportOutput ?? join(args.outputDir, getDefaultFilename(format))

  // Ensure output directory exists
  await ensureDir(dirname(outputPath))

  // Export based on format
  switch (format) {
    case 'pdf': {
      const pdfConfig = buildPdfConfig(args, config, args.input, thumbnails)
      const pdfData = await exportToPDF(filtered, pdfConfig)
      await writeFile(outputPath, pdfData)
      logger.success(`Exported ${filtered.length} activities to ${outputPath}`)
      break
    }

    case 'json': {
      const metadata = { inputFile: args.input, messageCount: 0, version: VERSION }
      const json = exportToJSON(filtered, metadata)
      await writeFile(outputPath, json)
      logger.success(`Exported ${filtered.length} activities to ${outputPath}`)
      break
    }

    case 'csv': {
      const csv = exportToCSV(filtered)
      await writeFile(outputPath, csv)
      logger.success(`Exported ${filtered.length} activities to ${outputPath}`)
      break
    }

    case 'excel': {
      const excel = await exportToExcel(filtered)
      await writeFile(outputPath, excel)
      logger.success(`Exported ${filtered.length} activities to ${outputPath}`)
      break
    }

    case 'map': {
      const defaultStyle = parseMapStyle(args.mapDefaultStyle ?? config?.mapDefaultStyle)
      const html = exportToMapHTML(filtered, {
        title: 'Things To Do',
        ...(defaultStyle && { defaultStyle })
      })
      await writeFile(outputPath, html)
      logger.success(`Exported ${filtered.length} activities to ${outputPath}`)
      break
    }

    default:
      logger.error(`Unknown export format: ${format}`)
      process.exit(1)
  }
}

/** Parse map style string to MapStyle type */
function parseMapStyle(style: string | undefined): MapStyle | undefined {
  if (style === 'osm' || style === 'satellite' || style === 'terrain') {
    return style
  }
  return undefined
}
