/**
 * CLI Pipeline Steps
 *
 * Individual processing steps for the analyze command.
 */

import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { FilesystemCache } from '../cache/filesystem'
import {
  classifyMessages,
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  extractCandidatesByHeuristics,
  filterActivities,
  geocodeActivities,
  parseChatWithStats,
  VERSION
} from '../index'
import type {
  CandidateMessage,
  ClassifiedActivity,
  ClassifierConfig,
  GeocodedActivity,
  GeocoderConfig,
  ParsedMessage
} from '../types'
import type { CLIArgs } from './args'
import { ensureDir, readInputFile } from './io'
import type { Logger } from './logger'
import { resolveContext, resolveModelConfig } from './model'
import { getCacheDir } from './steps/context'

export async function runParse(
  input: string,
  args: CLIArgs,
  logger: Logger
): Promise<ParsedMessage[]> {
  logger.log('\n📝 Parsing messages...')

  const content = await readInputFile(input)
  const result = parseChatWithStats(content)

  logger.success(
    `${result.messageCount.toLocaleString()} messages from ${result.senders.length} senders`
  )
  logger.success(
    `Date range: ${result.dateRange.start.toISOString().split('T')[0]} to ${result.dateRange.end.toISOString().split('T')[0]}`
  )
  logger.success(`${result.urlCount} messages contain URLs`)

  if (args.maxMessages !== undefined) {
    const limited = result.messages.slice(0, args.maxMessages)
    logger.log(`   (limited to first ${args.maxMessages} messages for testing)`)
    return [...limited]
  }

  return [...result.messages]
}

export function runExtract(
  messages: readonly ParsedMessage[],
  args: CLIArgs,
  logger: Logger
): CandidateMessage[] {
  logger.log('\n🔍 Extracting candidates...')

  const result = extractCandidatesByHeuristics(messages, {
    minConfidence: args.minConfidence
  })

  logger.success(`Regex patterns: ${result.regexMatches} matches`)
  logger.success(`URL-based: ${result.urlMatches} matches`)
  logger.success(`Total: ${result.totalUnique} unique candidates`)

  return [...result.candidates]
}

export async function runClassify(
  candidates: readonly CandidateMessage[],
  args: CLIArgs,
  logger: Logger
): Promise<ClassifiedActivity[]> {
  // Resolve model and context
  const { provider, apiModel: model, apiKey } = resolveModelConfig()
  const { homeCountry, timezone } = resolveContext(args.homeCountry, args.timezone)
  const batchSize = 10
  const totalBatches = Math.ceil(candidates.length / batchSize)

  logger.log(`\n🤖 Classifying ${candidates.length} candidates with ${model}...`)
  logger.log(`   Processing in ${totalBatches} batches of ${batchSize}`)

  // Use filesystem cache for API responses
  const cacheDir = getCacheDir(args.cacheDir)
  const cache = new FilesystemCache(cacheDir)

  const config: ClassifierConfig = {
    provider,
    apiKey,
    model,
    homeCountry,
    timezone,
    batchSize,
    onBatchStart: (info) => {
      logger.log(
        `   [${info.batchIndex + 1}/${info.totalBatches}] Sending ${info.candidateCount} candidates...`
      )
    },
    onBatchComplete: (info) => {
      logger.log(
        `   [${info.batchIndex + 1}/${info.totalBatches}] ✓ Found ${info.activityCount} activities (${info.durationMs}ms)`
      )
    }
  }

  const result = await classifyMessages(candidates, config, cache)

  if (!result.ok) {
    throw new Error(`Classification failed: ${result.error.message}`)
  }

  // Always filter by activity score - low scores are errands/chores, not fun activities
  const validActivities = filterActivities(result.value)

  logger.log('')
  logger.success(`Activities: ${validActivities.length}`)

  return validActivities
}

export async function runGeocode(
  suggestions: readonly ClassifiedActivity[],
  args: CLIArgs,
  logger: Logger
): Promise<GeocodedActivity[]> {
  if (args.skipGeocoding) {
    logger.log('\n📍 Skipping geocoding (--skip-geocoding)')
    return suggestions.map((s) => ({ ...s }))
  }

  logger.log('\n📍 Geocoding locations...')

  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    logger.error('GOOGLE_MAPS_API_KEY not set, skipping geocoding')
    return suggestions.map((s) => ({ ...s }))
  }

  const config: GeocoderConfig = {
    apiKey,
    defaultCountry: args.homeCountry
  }

  const results = await geocodeActivities(suggestions, config)

  const geocoded = results.filter((s) => s.latitude !== undefined)
  logger.success(`Successfully geocoded: ${geocoded.length}/${suggestions.length}`)

  return results
}

async function exportFormat(
  format: string,
  suggestions: readonly GeocodedActivity[],
  args: CLIArgs,
  logger: Logger,
  inputFile: string
): Promise<void> {
  switch (format.toLowerCase()) {
    case 'csv': {
      const csv = exportToCSV(suggestions)
      const csvPath = join(args.outputDir, 'suggestions.csv')
      await writeFile(csvPath, csv)
      logger.success(`${csvPath} (${suggestions.length} rows)`)
      break
    }

    case 'json': {
      const metadata = { inputFile: basename(inputFile), messageCount: 0, version: VERSION }
      const json = exportToJSON(suggestions, metadata)
      const jsonPath = join(args.outputDir, 'suggestions.json')
      await writeFile(jsonPath, json)
      logger.success(`${jsonPath}`)
      break
    }

    case 'map': {
      const html = exportToMapHTML(suggestions, { title: 'Things To Do' })
      const mapPath = join(args.outputDir, 'map.html')
      await writeFile(mapPath, html)
      const geocoded = suggestions.filter((s) => s.latitude !== undefined).length
      logger.success(`${mapPath} (${geocoded} mapped)`)
      break
    }

    case 'excel': {
      const excel = await exportToExcel(suggestions)
      const excelPath = join(args.outputDir, 'suggestions.xlsx')
      await writeFile(excelPath, excel)
      logger.success(`${excelPath} (${suggestions.length} rows)`)
      break
    }

    case 'pdf': {
      const pdf = await exportToPDF(suggestions, {
        title: 'Things To Do',
        subtitle: `Generated from ${basename(inputFile)}`
      })
      const pdfPath = join(args.outputDir, 'suggestions.pdf')
      await writeFile(pdfPath, pdf)
      logger.success(`${pdfPath}`)
      break
    }

    default:
      logger.error(`Unknown format: ${format}`)
  }
}

export async function runExport(
  suggestions: readonly GeocodedActivity[],
  args: CLIArgs,
  logger: Logger,
  inputFile: string
): Promise<void> {
  logger.log('\n📦 Exporting results...')
  await ensureDir(args.outputDir)

  for (const format of args.formats) {
    try {
      await exportFormat(format, suggestions, args, logger, inputFile)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to export ${format}: ${msg}`)
    }
  }
}
