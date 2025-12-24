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
  VERSION
} from '../../index'
import type { GeocodedActivity } from '../../types'
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
}

interface ExportResult {
  /** Paths to exported files, keyed by format */
  readonly exportedFiles: Map<ExportFormat, string>
}

/**
 * Export activities to specified formats.
 */
export async function stepExport(
  ctx: PipelineContext,
  activities: readonly GeocodedActivity[],
  options: ExportOptions
): Promise<ExportResult> {
  const { outputDir, formats } = options
  const inputFile = ctx.input

  await ensureDir(outputDir)

  const exportedFiles = new Map<ExportFormat, string>()

  for (const format of formats) {
    const path = await exportFormat(format, activities, outputDir, inputFile, options.thumbnails)
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
  thumbnails?: Map<string, Buffer>
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
      const html = exportToMapHTML(activities, { title: 'Things To Do' })
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
      const pdf = await exportToPDF(activities, {
        title: 'Things To Do',
        subtitle: `Generated from ${basename(inputFile)}`,
        thumbnails
      })
      const pdfPath = join(outputDir, 'activities.pdf')
      await writeFile(pdfPath, pdf)
      return pdfPath
    }

    default:
      return null
  }
}
