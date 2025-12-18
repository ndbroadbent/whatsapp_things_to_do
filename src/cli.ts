#!/usr/bin/env bun
/**
 * ChatToMap CLI
 *
 * Local orchestrator for the core library.
 * Handles file I/O, parallelization, progress reporting, and rate limiting.
 *
 * @license AGPL-3.0
 */

import { writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { type CLIArgs, HELP_TEXT, parseCliArgs } from './cli/args.js'
import { ensureDir, readInputFile } from './cli/io.js'
import { createLogger, type Logger } from './cli/logger.js'
import { formatDate, getCategoryEmoji, runQuickScanWithLogs, truncate } from './cli/preview.js'
import {
  classifyMessages,
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  extractCandidates,
  filterActivities,
  geocodeSuggestions,
  parseChatWithStats,
  VERSION
} from './index.js'
import type {
  CandidateMessage,
  ClassifiedSuggestion,
  ClassifierConfig,
  GeocodedSuggestion,
  GeocoderConfig,
  ParsedMessage
} from './types.js'

// ============================================================================
// Pipeline Steps
// ============================================================================

async function runParse(input: string, _args: CLIArgs, logger: Logger): Promise<ParsedMessage[]> {
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

  return [...result.messages]
}

function runExtract(
  messages: readonly ParsedMessage[],
  args: CLIArgs,
  logger: Logger
): CandidateMessage[] {
  logger.log('\n🔍 Extracting candidates...')

  const result = extractCandidates(messages, {
    minConfidence: args.minConfidence
  })

  logger.success(`Regex patterns: ${result.regexMatches} matches`)
  logger.success(`URL-based: ${result.urlMatches} matches`)
  logger.success(`Total: ${result.totalUnique} unique candidates`)

  return [...result.candidates]
}

async function runClassify(
  candidates: readonly CandidateMessage[],
  args: CLIArgs,
  logger: Logger
): Promise<ClassifiedSuggestion[]> {
  logger.log('\n🤖 Classifying with AI...')

  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('No AI API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY')
  }

  const provider: ClassifierConfig['provider'] = process.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : 'openai'

  const config: ClassifierConfig = {
    provider,
    apiKey,
    batchSize: 10
  }

  logger.verbose(`Using ${provider} for classification`)

  const result = await classifyMessages(candidates, config)

  if (!result.ok) {
    throw new Error(`Classification failed: ${result.error.message}`)
  }

  const activities = result.value.filter((s) => s.isActivity)
  const errands = result.value.filter((s) => !s.isActivity || s.activityScore < 0.5)

  logger.success(`Activities: ${activities.length}`)
  logger.success(`Errands (filtered): ${errands.length}`)

  if (args.activitiesOnly) {
    return filterActivities(result.value)
  }

  return result.value.filter((s) => s.isActivity)
}

async function runGeocode(
  suggestions: readonly ClassifiedSuggestion[],
  args: CLIArgs,
  logger: Logger
): Promise<GeocodedSuggestion[]> {
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
    regionBias: args.region,
    defaultCountry: args.region === 'NZ' ? 'New Zealand' : undefined
  }

  const results = await geocodeSuggestions(suggestions, config)

  const geocoded = results.filter((s) => s.latitude !== undefined)
  logger.success(`Successfully geocoded: ${geocoded.length}/${suggestions.length}`)

  return results
}

async function exportFormat(
  format: string,
  suggestions: readonly GeocodedSuggestion[],
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

async function runExport(
  suggestions: readonly GeocodedSuggestion[],
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

// ============================================================================
// Commands
// ============================================================================

async function cmdPreview(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Preview v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  const { scanResult, hasNoCandidates } = await runQuickScanWithLogs(args.input, logger)

  logger.log(`\n🔍 Quick scan found ${scanResult.stats.totalUnique} potential activities`)

  if (hasNoCandidates) {
    return
  }

  // Step 2: Require API key for AI classification
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'preview command requires ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable'
    )
  }

  // Step 3: Take top candidates and classify (single AI call)
  // Classify 2x the limit to account for filtering out non-activities
  const classifyCount = Math.min(args.limit * 2, scanResult.candidates.length)
  const topCandidates = scanResult.candidates.slice(0, classifyCount)

  logger.log(`\n✨ Top ${args.limit} suggestions (AI-classified):`)
  logger.log('')

  const provider: ClassifierConfig['provider'] = process.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : 'openai'

  const classifyResult = await classifyMessages(topCandidates, {
    provider,
    apiKey,
    batchSize: classifyCount // Single batch for all candidates
  })

  if (!classifyResult.ok) {
    throw new Error(`Classification failed: ${classifyResult.error.message}`)
  }

  // Filter to activities and sort by score
  const activities = classifyResult.value
    .filter((s) => s.isActivity && s.activityScore >= 0.5)
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, args.limit)

  if (activities.length === 0) {
    logger.log('   No activities found after AI classification.')
    logger.log('')
    logger.log('💡 Try running full analysis: chat-to-map analyze <input>')
    return
  }

  for (let i = 0; i < activities.length; i++) {
    const s = activities[i]
    if (!s) continue
    const emoji = getCategoryEmoji(s.category)
    const activity = truncate(s.activity, 55)
    const category = s.category.charAt(0).toUpperCase() + s.category.slice(1)

    logger.log(`${i + 1}. ${emoji}  "${activity}"`)
    logger.log(`   → ${category} • ${s.sender} • ${formatDate(s.timestamp)}`)
    if (s.location) {
      logger.log(`   📍 ${s.location}`)
    }
    logger.log('')
  }

  const totalCandidates = scanResult.stats.totalUnique
  logger.log(
    `💡 Run 'chat-to-map analyze ${basename(args.input)}' to process all ${totalCandidates} candidates`
  )
}

async function cmdScan(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Scan v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  const { scanResult, hasNoCandidates } = await runQuickScanWithLogs(args.input, logger)

  logger.log(`\n🔍 Heuristic scan found ${scanResult.stats.totalUnique} potential activities`)
  logger.log(`   Regex patterns: ${scanResult.stats.regexMatches} matches`)
  logger.log(`   URL-based: ${scanResult.stats.urlMatches} matches`)

  if (hasNoCandidates) {
    return
  }

  const candidates = scanResult.candidates.slice(0, args.limit)
  logger.log(`\n📋 Top ${candidates.length} candidates (by confidence):`)
  logger.log('')

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (!c) continue
    const msg = truncate(c.content, 70)
    logger.log(`${i + 1}. "${msg}"`)
    logger.log(
      `   ${c.sender} • ${formatDate(c.timestamp)} • confidence: ${c.confidence.toFixed(2)}`
    )
    logger.log('')
  }

  const remaining = scanResult.stats.totalUnique - candidates.length
  if (remaining > 0) {
    logger.log(`   ... and ${remaining} more candidates`)
    logger.log('')
  }

  logger.log(`💡 Run 'chat-to-map preview ${basename(args.input)}' for AI-powered classification`)
}

async function cmdAnalyze(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap v${VERSION}`)
  logger.log(`\n📁 Reading: ${args.input}`)

  const messages = await runParse(args.input, args, logger)

  if (args.dryRun) {
    logger.log('\n📊 Dry run complete. No API calls made.')
    return
  }

  const candidates = runExtract(messages, args, logger)

  if (candidates.length === 0) {
    logger.log('\n⚠️  No candidates found. Nothing to process.')
    return
  }

  const suggestions = await runClassify(candidates, args, logger)

  if (suggestions.length === 0) {
    logger.log('\n⚠️  No activities found after classification.')
    return
  }

  const geocoded = await runGeocode(suggestions, args, logger)
  await runExport(geocoded, args, logger, args.input)

  const mapPath = join(args.outputDir, 'map.html')
  logger.log(`\n✨ Done! Open ${mapPath} to view your activity map.`)
}

async function cmdParse(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  const messages = await runParse(args.input, args, logger)

  if (args.outputDir !== './output') {
    await ensureDir(dirname(args.outputDir))
    const json = JSON.stringify(messages, null, 2)
    await writeFile(args.outputDir, json)
    logger.success(`Saved to ${args.outputDir}`)
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseCliArgs()
  const logger = createLogger(args.quiet, args.verbose)

  try {
    switch (args.command) {
      case 'analyze':
        await cmdAnalyze(args, logger)
        break

      case 'preview':
        await cmdPreview(args, logger)
        break

      case 'scan':
        await cmdScan(args, logger)
        break

      case 'parse':
        await cmdParse(args, logger)
        break

      default:
        console.log(HELP_TEXT)
        process.exit(1)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(msg)
    if (args.verbose && error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
