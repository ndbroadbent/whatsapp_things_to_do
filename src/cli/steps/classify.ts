/**
 * Classify Step
 *
 * AI-powered classification of candidate messages into activities.
 * Uses worker pool for parallel API calls.
 * Uses caching at both pipeline and API levels.
 */

import { classifyBatch, filterActivities, sortActivitiesByScore } from '../../index'
import type { ScrapedMetadata } from '../../scraper/types'
import type { CandidateMessage, ClassifiedActivity, ClassifierConfig } from '../../types'
import { aggregateActivities } from '../aggregation'
import { resolveModelConfig, resolveUserContext } from '../model'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

const DEFAULT_BATCH_SIZE = 30
const DEFAULT_CONCURRENCY = 5

/**
 * Stats saved to classify_stats.json
 */
interface ClassifyStats {
  readonly candidatesClassified: number
  readonly activitiesFound: number
  readonly model: string
  readonly provider: string
  readonly batchCount: number
  readonly cachedBatches: number
}

/**
 * Result of the classify step.
 */
interface ClassifyResult {
  /** Classified activities */
  readonly activities: readonly ClassifiedActivity[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Classification stats */
  readonly stats: ClassifyStats
}

/**
 * Classify step options.
 */
interface ClassifyOptions {
  /** Home country for location context */
  readonly homeCountry?: string | undefined
  /** Timezone for date context */
  readonly timezone?: string | undefined
  /** Config file path for resolving user context */
  readonly configFile?: string | undefined
  /** URL metadata from scrape step */
  readonly urlMetadata?: Map<string, ScrapedMetadata> | undefined
  /** Batch size for API calls (default 30) */
  readonly batchSize?: number | undefined
  /** Number of concurrent API calls (default 5) */
  readonly concurrency?: number | undefined
}

/**
 * Create batches from candidates.
 */
function createBatches<T>(items: readonly T[], batchSize: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push([...items.slice(i, i + batchSize)])
  }
  return batches
}

/**
 * Run the classify step.
 *
 * Uses worker pool for parallel classification.
 * Checks pipeline cache first, calls classifier API if needed.
 * Uses API cache for individual batch results.
 */
export async function stepClassify(
  ctx: PipelineContext,
  candidates: readonly CandidateMessage[],
  options?: ClassifyOptions
): Promise<ClassifyResult> {
  const { pipelineCache, apiCache, logger, noCache, cacheDir } = ctx

  // Check pipeline cache - only valid if classify_stats exists (completion marker)
  if (!noCache && pipelineCache.hasStage('classify_stats')) {
    const activities = pipelineCache.getStage<ClassifiedActivity[]>('classifications') ?? []
    const stats = pipelineCache.getStage<ClassifyStats>('classify_stats')
    logger.log('\n🤖 Classifying candidates... 📦 cached')
    return {
      activities,
      fromCache: true,
      stats: stats ?? {
        candidatesClassified: candidates.length,
        activitiesFound: activities.length,
        model: 'unknown',
        provider: 'unknown',
        batchCount: 0,
        cachedBatches: 0
      }
    }
  }

  if (candidates.length === 0) {
    logger.log('\n🤖 Classifying candidates... (no candidates)')
    const stats: ClassifyStats = {
      candidatesClassified: 0,
      activitiesFound: 0,
      model: 'none',
      provider: 'none',
      batchCount: 0,
      cachedBatches: 0
    }
    pipelineCache.setStage('classify_stats', stats)
    pipelineCache.setStage('classifications', [])
    return { activities: [], fromCache: false, stats }
  }

  // Resolve model and context
  const { provider, apiModel: model, apiKey } = resolveModelConfig()
  const { homeCountry, timezone } = await resolveUserContext({
    argsHomeCountry: options?.homeCountry,
    argsTimezone: options?.timezone,
    configFile: options?.configFile,
    cacheDir,
    logger
  })

  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY
  const batches = createBatches(candidates, batchSize)

  logger.log(`\n🤖 Classifying ${candidates.length} candidates with ${model}...`)

  const config: ClassifierConfig = {
    provider,
    apiKey,
    model,
    homeCountry,
    timezone,
    urlMetadata: options?.urlMetadata,
    batchSize
  }

  const cachedBatches = 0

  // Process batches in parallel using worker pool
  const poolResult = await runWorkerPool(
    batches,
    async (batch) => {
      const result = await classifyBatch(batch, config, apiCache)
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      return result.value
    },
    {
      concurrency,
      onProgress: ({ index, total, completed, result, durationMs }) => {
        const percent = Math.floor((completed / total) * 100)
        logger.log(
          `   ${percent}% [${completed}/${total}] ✓ Batch ${index + 1}: ${result.length} activities (${durationMs}ms)`
        )
      },
      onError: ({ index, error, total }) => {
        logger.log(`   ✗ Batch ${index + 1}/${total} failed: ${error.message}`)
        return true // Continue on error
      }
    }
  )

  // Flatten all activities
  const allActivities: ClassifiedActivity[] = []
  for (const batchResult of poolResult.successes) {
    allActivities.push(...batchResult)
  }

  // Deduplicate, filter, and sort activities by score (interesting prioritized over fun)
  const deduplicated = aggregateActivities(allActivities)
  const activities = sortActivitiesByScore(filterActivities(deduplicated))

  const stats: ClassifyStats = {
    candidatesClassified: candidates.length,
    activitiesFound: activities.length,
    model,
    provider,
    batchCount: batches.length,
    cachedBatches
  }

  // Cache results
  pipelineCache.setStage('classifications', [...activities])
  pipelineCache.setStage('classify_stats', stats)

  logger.log(`   ✓ ${activities.length} activities found`)

  return { activities, fromCache: false, stats }
}
