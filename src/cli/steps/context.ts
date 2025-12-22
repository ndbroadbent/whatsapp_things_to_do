/**
 * Pipeline Context
 *
 * Shared context for all pipeline steps including caches and logger.
 */

import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { FilesystemCache } from '../../cache/filesystem'
import { PipelineCache } from '../../cache/pipeline'
import type { Logger } from '../logger'
import { readInputFileWithCache } from './read'

/**
 * Options for initializing the pipeline context.
 */
export interface InitContextOptions {
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
 * Initialize pipeline context for an input file.
 *
 * This is the entry point for all pipeline operations:
 * 1. Reads input file (with zip extraction caching)
 * 2. Creates/finds pipeline run based on content hash
 * 3. Initializes API cache
 */
/**
 * Get the cache directory: CLI arg > env var > default.
 */
export function getCacheDir(override?: string): string {
  return override ?? process.env.CHAT_TO_MAP_CACHE_DIR ?? join(homedir(), '.cache', 'chat-to-map')
}

export async function initContext(
  input: string,
  logger: Logger,
  options?: InitContextOptions
): Promise<PipelineContext> {
  const cacheDir = getCacheDir(options?.cacheDir)
  const noCache = options?.noCache ?? false

  // Read input (with zip extraction caching - always cache zip extraction)
  const { content, fromCache } = await readInputFileWithCache(input, { cacheDir })

  // Initialize caches
  const pipelineCache = new PipelineCache(cacheDir)
  const apiCache = new FilesystemCache(cacheDir)

  // Get or create pipeline run (always get the run dir, even if noCache)
  const run = pipelineCache.getOrCreateRun(input, content)
  if (noCache) {
    logger.log(`\n📂 Cache: ${basename(run.runDir)} (--no-cache: regenerating)`)
  } else {
    logger.log(`\n📂 Cache: ${basename(run.runDir)}`)
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
