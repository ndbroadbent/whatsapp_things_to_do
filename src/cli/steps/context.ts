/**
 * Pipeline Context
 *
 * Shared context for all pipeline steps including caches and logger.
 */

import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { FilesystemCache } from '../../cache/filesystem'
import { hashFileBytes, PipelineCache } from '../../cache/pipeline'
import type { Logger } from '../logger'
import { readInputFileWithMetadata } from './read'

/**
 * Options for initializing the pipeline context.
 */
interface InitContextOptions {
  /** Skip cache and regenerate all results */
  readonly noCache?: boolean | undefined
  /** Custom cache directory (overrides env var and default) */
  readonly cacheDir?: string | undefined
}

/**
 * Pipeline context passed to all steps.
 */
export interface PipelineContext {
  /** Original input path */
  readonly input: string
  /** Extracted content (from zip or txt) */
  readonly content: string
  /** Whether content was read from cache */
  readonly contentFromCache: boolean
  /** Pipeline cache for step outputs */
  readonly pipelineCache: PipelineCache
  /** API cache for external service responses */
  readonly apiCache: FilesystemCache
  /** Logger for output */
  readonly logger: Logger
  /** Cache directory */
  readonly cacheDir: string
  /** Skip cache and regenerate all results */
  readonly noCache: boolean
}

/**
 * Get the cache directory: CLI arg > env var > default.
 */
function getCacheDir(override?: string): string {
  return override ?? process.env.CHAT_TO_MAP_CACHE_DIR ?? join(homedir(), '.cache', 'chat-to-map')
}

/**
 * Initialize pipeline context for an input file.
 *
 * This is the entry point for all pipeline operations:
 * 1. Hashes file bytes once
 * 2. Finds or creates pipeline run based on hash
 * 3. Reads input file (with zip extraction caching)
 * 4. Initializes API cache
 */
export async function initContext(
  input: string,
  logger: Logger,
  options?: InitContextOptions
): Promise<PipelineContext> {
  const cacheDir = getCacheDir(options?.cacheDir)
  const noCache = options?.noCache ?? false

  // Hash file once upfront
  const fileHash = hashFileBytes(input)

  // Initialize caches
  const pipelineCache = new PipelineCache(cacheDir)
  const apiCache = new FilesystemCache(cacheDir)

  // Find existing run or prepare for new one
  const existingRun = noCache ? null : pipelineCache.findLatestRun(input, fileHash)

  let content: string
  let fromCache = false

  if (existingRun && pipelineCache.hasStage('chat')) {
    // Use cached chat.txt content
    content = pipelineCache.getStage<string>('chat') ?? ''
    fromCache = true
    logger.log(`\n📂 Cache: ${basename(existingRun.runDir)}`)
  } else {
    // Read and extract the input file
    const { content: extractedContent } = await readInputFileWithMetadata(input)
    content = extractedContent

    // Create new pipeline run and cache chat.txt
    const run = pipelineCache.initRun(input, fileHash)
    pipelineCache.setStage('chat', content)
    if (noCache) {
      logger.log(`\n📂 Cache: ${basename(run.runDir)} (--no-cache: regenerating)`)
    } else {
      logger.log(`\n📂 Cache: ${basename(run.runDir)}`)
    }
  }

  return {
    input,
    content,
    contentFromCache: fromCache,
    pipelineCache,
    apiCache,
    logger,
    cacheDir,
    noCache
  }
}
