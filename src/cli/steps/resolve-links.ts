/**
 * Resolve Links Step
 *
 * Resolves entity hints from classified activities to canonical URLs.
 * Uses the 5-stage entity resolution pipeline (Wikidata → OpenLibrary → Google → Heuristics → AI).
 */

import type { ResponseCache } from '../../caching/types'
import {
  type EntityType,
  type ResolvedEntity,
  type ResolverConfig,
  resolveEntity
} from '../../search'
import type { GeocodedActivity } from '../../types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

const DEFAULT_CONCURRENCY = 5

/**
 * Maps classifier link types to entity resolver types.
 * Only resolvable types are included.
 */
const LINK_TYPE_TO_ENTITY_TYPE: Record<string, EntityType> = {
  movie: 'movie',
  book: 'book',
  board_game: 'physical_game',
  physical_game: 'physical_game',
  tv_show: 'tv_show',
  video_game: 'video_game',
  album: 'album',
  song: 'song',
  podcast: 'podcast'
}

/**
 * Stats saved to resolve_links_stats.json
 */
interface ResolveLinkStats {
  readonly activitiesProcessed: number
  readonly withLinkHints: number
  readonly resolved: number
  readonly failed: number
  readonly skipped: number
}

/**
 * Result of the resolve links step.
 */
interface ResolveLinkResult {
  /** Activities with resolvedUrl populated where applicable */
  readonly activities: readonly GeocodedActivity[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Resolution stats */
  readonly stats: ResolveLinkStats
  /** Resolved entities for further processing (e.g., building LinkPreview) */
  readonly resolvedEntities: ReadonlyMap<string, ResolvedEntity>
}

/**
 * Resolve links step options.
 */
interface ResolveLinkOptions {
  /** Number of concurrent resolution requests (default 5) */
  readonly concurrency?: number | undefined
  /** Google Programmable Search API key */
  readonly googleApiKey?: string | undefined
  /** Google Programmable Search engine ID */
  readonly googleCx?: string | undefined
  /** Google AI API key (for Gemini disambiguation) */
  readonly geminiApiKey?: string | undefined
}

/**
 * Check if a link type is resolvable.
 */
function isResolvableLinkType(linkType: string): linkType is keyof typeof LINK_TYPE_TO_ENTITY_TYPE {
  return linkType in LINK_TYPE_TO_ENTITY_TYPE
}

/**
 * Build resolver config from environment and options.
 */
function buildResolverConfig(cache: ResponseCache, options?: ResolveLinkOptions): ResolverConfig {
  const googleApiKey = options?.googleApiKey ?? process.env.GOOGLE_PROGRAMMABLE_SEARCH_API_KEY
  const googleCx = options?.googleCx ?? process.env.GOOGLE_PROGRAMMABLE_SEARCH_CX
  const geminiApiKey = options?.geminiApiKey ?? process.env.GOOGLE_AI_API_KEY

  return {
    wikidata: true,
    openlibrary: true,
    cache,
    googleSearch: googleApiKey && googleCx ? { apiKey: googleApiKey, cx: googleCx } : undefined,
    aiClassification: geminiApiKey ? { apiKey: geminiApiKey } : undefined
  }
}

/**
 * Resolve a single activity's link hints to a canonical URL.
 * Returns the resolved entity or null if resolution fails/skipped.
 */
async function resolveActivityLink(
  activity: GeocodedActivity,
  config: ResolverConfig
): Promise<ResolvedEntity | null> {
  const link = activity.link

  // Skip if no link hints
  if (!link) {
    return null
  }

  // Check if link type is resolvable
  if (!link.type || !isResolvableLinkType(link.type)) {
    return null
  }

  // Map link type to entity type
  const entityType = LINK_TYPE_TO_ENTITY_TYPE[link.type]
  if (!entityType) {
    return null
  }

  // Resolve entity
  return resolveEntity(link.query, entityType, config)
}

/**
 * Run the resolve links step.
 *
 * Resolves entity hints from classified activities to canonical URLs.
 * Checks pipeline cache first, calls resolution APIs if needed.
 */
export async function stepResolveLinks(
  ctx: PipelineContext,
  activities: readonly GeocodedActivity[],
  options?: ResolveLinkOptions
): Promise<ResolveLinkResult> {
  const { pipelineCache, apiCache, logger, skipPipelineCache } = ctx
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if resolve_links_stats exists (completion marker)
  if (!skipPipelineCache && pipelineCache.hasStage('resolve_links_stats')) {
    const cached = pipelineCache.getStage<GeocodedActivity[]>('resolved_links') ?? []
    const stats = pipelineCache.getStage<ResolveLinkStats>('resolve_links_stats')
    const cachedEntities =
      pipelineCache.getStage<Array<[string, ResolvedEntity]>>('resolved_entities') ?? []
    logger.log('\n🔗 Resolving links... 📦 cached')
    return {
      activities: cached,
      fromCache: true,
      stats: stats ?? {
        activitiesProcessed: cached.length,
        withLinkHints: 0,
        resolved: 0,
        failed: 0,
        skipped: 0
      },
      resolvedEntities: new Map(cachedEntities)
    }
  }

  if (activities.length === 0) {
    logger.log('\n🔗 Resolving links... (no activities)')
    const stats: ResolveLinkStats = {
      activitiesProcessed: 0,
      withLinkHints: 0,
      resolved: 0,
      failed: 0,
      skipped: 0
    }
    pipelineCache.setStage('resolve_links_stats', stats)
    pipelineCache.setStage('resolved_links', [])
    pipelineCache.setStage('resolved_entities', [])
    return {
      activities: [],
      fromCache: false,
      stats,
      resolvedEntities: new Map()
    }
  }

  // Count activities with link hints
  const withLinkHints = activities.filter((a) => a.link !== null).length
  const needsResolution = activities.filter(
    (a) => a.link?.type && isResolvableLinkType(a.link.type)
  )

  logger.log(`\n🔗 Resolving links for ${needsResolution.length} activities...`)

  const config = buildResolverConfig(apiCache, options)

  // Map to store resolved entities by activity ID
  const resolvedEntities = new Map<string, ResolvedEntity>()

  // Process activities in parallel using worker pool
  const poolResult = await runWorkerPool(
    activities,
    async (activity) => {
      const resolved = await resolveActivityLink(activity, config)

      if (resolved) {
        // Store for later use in scrape-previews
        resolvedEntities.set(activity.activityId, resolved)

        // Add resolvedUrl to activity
        return {
          ...activity,
          resolvedUrl: resolved.url
        } as GeocodedActivity
      }

      // No resolution needed or possible
      return activity
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        if (completed % 10 === 0 || completed === total) {
          const percent = Math.floor((completed / total) * 100)
          logger.log(`   ${percent}% resolved (${completed}/${total} activities)`)
        }
      }
    }
  )

  // Collect results
  const resolvedActivities: GeocodedActivity[] = poolResult.successes

  // Calculate stats
  const resolved = resolvedActivities.filter((a) => a.resolvedUrl).length
  const skipped = withLinkHints - needsResolution.length
  const failed = needsResolution.length - resolvedEntities.size

  const stats: ResolveLinkStats = {
    activitiesProcessed: activities.length,
    withLinkHints,
    resolved,
    failed,
    skipped
  }

  // Cache results
  pipelineCache.setStage('resolved_links', [...resolvedActivities])
  pipelineCache.setStage('resolve_links_stats', stats)
  pipelineCache.setStage('resolved_entities', [...resolvedEntities.entries()])

  logger.log(`   ✓ ${resolved}/${withLinkHints} links resolved`)
  if (resolvedEntities.size > 0) {
    logger.log(`   🌐 ${resolvedEntities.size} resolved via entity search`)
  }
  if (failed > 0) {
    logger.log(`   ⚠️  ${failed} could not be resolved`)
  }

  return {
    activities: resolvedActivities,
    fromCache: false,
    stats,
    resolvedEntities
  }
}
