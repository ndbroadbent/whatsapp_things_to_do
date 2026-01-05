/**
 * Classify Command
 *
 * AI-powered classification of candidates into activities.
 * Runs: parse → scan → embed → filter → scrape-urls → classify
 */

import { writeFile } from 'node:fs/promises'
import {
  calculateAIInputCost,
  calculateAIOutputCost,
  ESTIMATION_DEFAULTS,
  formatMicrosAsDollars
} from '../../costs'
import { type ClassifiedActivity, formatLocation } from '../../types'
import type { CLIArgs } from '../args'
import {
  formatActivityHeader,
  initCommandContext,
  type OutputMessage,
  toOutputMessages
} from '../helpers'
import type { Logger } from '../logger'
import { stepClassify } from '../steps/classify'
import { StepRunner } from '../steps/runner'

export interface ClassifyOutputActivity {
  activity: string
  category: string
  messages: OutputMessage[]
  mentionCount: number
  placeName: string | null
  placeQuery: string | null
  city: string | null
  region: string | null
  country: string | null
  interestingScore: number
  funScore: number
  image: {
    stock: string
    mediaKey: string | null
    preferStock?: boolean
  }
  link?:
    | {
        type: string
        query: string
        url: string | null
      }
    | undefined
}

export interface ClassifyOutput {
  candidatesClassified: number
  activitiesFound: number
  model: string
  provider: string
  activities: ClassifyOutputActivity[]
}

/**
 * Convert a ClassifiedActivity to the JSON output format.
 */
export function toOutputActivity(a: ClassifiedActivity): ClassifyOutputActivity {
  return {
    activity: a.activity,
    category: a.category,
    messages: toOutputMessages(a.messages),
    mentionCount: a.messages.length,
    placeName: a.placeName,
    placeQuery: a.placeQuery,
    city: a.city,
    region: a.region,
    country: a.country,
    interestingScore: a.interestingScore,
    funScore: a.funScore,
    image: a.image,
    link: a.link ?? undefined
  }
}

/**
 * Build the full ClassifyOutput from classification results.
 * Extracted for testability.
 */
export function buildClassifyOutput(
  stats: { candidatesClassified: number; activitiesFound: number; model: string; provider: string },
  activities: readonly ClassifiedActivity[]
): ClassifyOutput {
  return {
    candidatesClassified: stats.candidatesClassified,
    activitiesFound: stats.activitiesFound,
    model: stats.model,
    provider: stats.provider,
    activities: activities.map(toOutputActivity)
  }
}

export async function cmdClassify(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, config } = await initCommandContext('Classify', args, logger)

  // Use StepRunner to handle dependencies: filter → scrapeUrls → classify
  const runner = new StepRunner(ctx, args, config, logger)

  // Run filter step (which runs parse → scan → embed → filter)
  const { candidates } = await runner.run('filter')

  logger.log(`   Found ${candidates.length} candidates`)

  if (candidates.length === 0) {
    logger.log('\n⚠️  No candidates found. Nothing to classify.')
    return
  }

  // Run scrapeUrls step
  const { metadataMap } = await runner.run('scrapeUrls')

  // Dry run: show stats and exit
  if (args.dryRun) {
    // Estimate classification cost
    // Use default model for estimation (gemini-3-flash-preview)
    const estimatedModel = 'gemini-3-flash-preview'
    const batchSize = 30
    const estimatedBatches = Math.ceil(candidates.length / batchSize)
    // Rough estimate: ~100 tokens per candidate input, ~150 tokens per activity output
    const estimatedInputTokens = candidates.length * 100
    const estimatedOutputTokens = candidates.length * ESTIMATION_DEFAULTS.outputTokensPerActivity
    const inputCostMicros = calculateAIInputCost(estimatedModel, estimatedInputTokens)
    const outputCostMicros = calculateAIOutputCost(estimatedModel, estimatedOutputTokens)
    const totalCostMicros = inputCostMicros + outputCostMicros

    logger.log('\n📊 Classification Estimate (dry run)')
    logger.log(`   Candidates to classify: ${candidates.length}`)
    logger.log(`   Estimated batches: ${estimatedBatches}`)
    logger.log(`   Model: ${estimatedModel}`)
    logger.log(
      `   Estimated tokens: ${estimatedInputTokens.toLocaleString()} in / ${estimatedOutputTokens.toLocaleString()} out`
    )
    logger.log(`   Estimated cost: ${formatMicrosAsDollars(totalCostMicros)}`)
    return
  }

  // Run classify step
  const classifyResult = await stepClassify(ctx, candidates, {
    homeCountry: args.homeCountry,
    timezone: args.timezone,
    configFile: args.configFile,
    urlMetadata: metadataMap,
    batchSize: 30
  })

  // Summary
  logger.log('\n📊 Classification Results')
  logger.log(`   Candidates: ${classifyResult.stats.candidatesClassified}`)
  logger.log(`   Activities: ${classifyResult.stats.activitiesFound}`)
  logger.log(`   Model: ${classifyResult.stats.model} (${classifyResult.stats.provider})`)
  if (classifyResult.stats.cachedBatches > 0) {
    logger.log(
      `   Cached batches: ${classifyResult.stats.cachedBatches}/${classifyResult.stats.batchCount}`
    )
  }

  const output = buildClassifyOutput(classifyResult.stats, classifyResult.activities)

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved classification results to ${args.jsonOutput}`)
    }
  } else {
    displayActivities(classifyResult.activities, logger, args.showAll, args.maxResults)
  }
}

function displayActivities(
  activities: readonly ClassifiedActivity[],
  logger: Logger,
  showAll: boolean,
  maxResults: number
): void {
  if (activities.length === 0) {
    logger.log('\n📋 Activities: none found')
    return
  }

  logger.log('\n📋 Activities:')
  logger.log('')

  const displayCount = showAll ? activities.length : Math.min(maxResults, activities.length)

  for (let i = 0; i < displayCount; i++) {
    const a = activities[i]
    if (!a) continue

    const { line1, line2 } = formatActivityHeader(i, a)
    logger.log(line1)
    logger.log(line2)

    const location = formatLocation(a)
    if (location) {
      logger.log(`   📍 ${location}`)
    }

    logger.log(`   ★ interesting: ${a.interestingScore.toFixed(1)}, fun: ${a.funScore.toFixed(1)}`)
    logger.log('')
  }

  if (!showAll && activities.length > maxResults) {
    logger.log(`   ... and ${activities.length - maxResults} more (use --all to show all)`)
  }
}
