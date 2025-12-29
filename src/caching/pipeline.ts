/**
 * Pipeline Cache (Layer 1)
 *
 * Per-run pipeline cache that stores outputs for each pipeline step.
 * Organized by input file with datetime and file hash for versioning.
 *
 * Directory structure:
 * ```
 * chat-to-map/cache/chats/<input-filename>/<datetime>-<sha256>/
 * ├── chat.txt
 * ├── messages.json
 * ├── candidates.heuristics.json
 * ├── candidates.embeddings.json
 * ├── candidates.all.json
 * ├── scraped_urls.json
 * ├── classifications.json
 * └── geocodings.json
 * ```
 *
 * The sha256 is computed from the input file bytes (NOT content).
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

type PipelineStage =
  | 'chat'
  | 'messages'
  | 'parse_stats'
  | 'scan_stats'
  | 'filter_stats'
  | 'preview_stats'
  | 'preview_activities'
  | 'embed_stats'
  | 'scrape_stats'
  | 'scrape_metadata'
  | 'classify_stats'
  | 'geocode_stats'
  | 'fetch_images_stats'
  | 'candidates.heuristics'
  | 'candidates.embeddings'
  | 'candidates.all'
  | 'classifications'
  | 'geocodings'
  | 'images'

interface PipelineRunMeta {
  inputFile: string
  fileHash: string
  createdAt: string
  runDir: string
}

/**
 * Calculate SHA256 hash of file bytes.
 */
export function hashFileBytes(filePath: string): string {
  const bytes = readFileSync(filePath)
  return createHash('sha256').update(new Uint8Array(bytes)).digest('hex').slice(0, 16)
}

/**
 * Format datetime for directory name (ISO 8601 with safe chars).
 */
function formatDatetimeForDir(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/**
 * Sanitize filename for use in paths.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 100)
}

/**
 * Find the latest run directory matching a hash suffix.
 * Returns the directory name or null if none found.
 */
function findLatestRunDirByHash(inputDir: string, hash: string): string | null {
  if (!existsSync(inputDir)) {
    return null
  }
  const entries = readdirSync(inputDir, { withFileTypes: true })
  const matchingRuns = entries
    .filter((e) => e.isDirectory() && e.name.endsWith(`-${hash}`))
    .map((e) => e.name)
    .sort()
    .reverse()
  return matchingRuns[0] ?? null
}

const STAGES_WITH_TIMESTAMPS: PipelineStage[] = [
  'messages',
  'candidates.heuristics',
  'candidates.embeddings',
  'candidates.all',
  'classifications',
  'geocodings'
]

function stageHasTimestamps(stage: PipelineStage): boolean {
  return STAGES_WITH_TIMESTAMPS.includes(stage)
}

function restoreTimestamps(items: unknown[]): void {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.timestamp === 'string') {
      record.timestamp = new Date(record.timestamp)
    }
    restoreContextTimestamps(record.contextBefore)
    restoreContextTimestamps(record.contextAfter)
  }
}

function restoreContextTimestamps(context: unknown): void {
  if (!Array.isArray(context)) return
  for (const ctx of context) {
    if (
      ctx &&
      typeof ctx === 'object' &&
      typeof (ctx as Record<string, unknown>).timestamp === 'string'
    ) {
      ;(ctx as Record<string, unknown>).timestamp = new Date(
        (ctx as Record<string, unknown>).timestamp as string
      )
    }
  }
}

/**
 * Pipeline cache for per-run stage outputs.
 */
export class PipelineCache {
  private readonly chatsDir: string
  private currentRun: PipelineRunMeta | null = null

  constructor(cacheDir: string) {
    this.chatsDir = join(cacheDir, 'chats')
  }

  /**
   * Find or create a run for this input file.
   * Reuses existing run if hash matches, otherwise creates new.
   */
  getOrCreateRun(inputFilename: string, fileHash: string): PipelineRunMeta {
    const existing = this.findLatestRun(inputFilename, fileHash)
    if (existing) {
      return existing
    }
    return this.initRun(inputFilename, fileHash)
  }

  /**
   * Initialize a new pipeline run for an input file.
   * Creates the run directory based on datetime and file hash.
   */
  initRun(inputFilename: string, fileHash: string): PipelineRunMeta {
    const datetime = formatDatetimeForDir()
    const safeName = sanitizeFilename(basename(inputFilename, '.zip').replace('.txt', ''))
    const runDirName = `${datetime}-${fileHash}`
    const runDir = join(this.chatsDir, safeName, runDirName)

    if (runDir.startsWith('--')) {
      throw new Error(`PipelineCache.initRun called with flag-like runDir: "${runDir}"`)
    }
    if (!existsSync(runDir)) {
      mkdirSync(runDir, { recursive: true })
    }

    this.currentRun = {
      inputFile: inputFilename,
      fileHash,
      createdAt: datetime,
      runDir
    }

    return this.currentRun
  }

  /**
   * Find the most recent run for a given input file and hash.
   * Returns null if no matching run exists.
   */
  findLatestRun(inputFilename: string, fileHash: string): PipelineRunMeta | null {
    const safeName = sanitizeFilename(basename(inputFilename, '.zip').replace('.txt', ''))
    const inputDir = join(this.chatsDir, safeName)

    const latestRunDir = findLatestRunDirByHash(inputDir, fileHash)
    if (!latestRunDir) {
      return null
    }

    const datetime = latestRunDir.slice(0, 19)
    this.currentRun = {
      inputFile: inputFilename,
      fileHash,
      createdAt: datetime,
      runDir: join(inputDir, latestRunDir)
    }

    return this.currentRun
  }

  /**
   * Get the file path for a pipeline stage.
   */
  private getStagePath(stage: PipelineStage): string {
    if (!this.currentRun) {
      throw new Error('Pipeline run not initialized. Call initRun() or findLatestRun() first.')
    }

    const ext = stage === 'chat' ? 'txt' : 'json'
    return join(this.currentRun.runDir, `${stage}.${ext}`)
  }

  /**
   * Check if a pipeline stage has cached output.
   */
  hasStage(stage: PipelineStage): boolean {
    try {
      const path = this.getStagePath(stage)
      return existsSync(path)
    } catch {
      return false
    }
  }

  /**
   * Get cached output for a pipeline stage.
   */
  getStage<T>(stage: PipelineStage): T | null {
    if (!this.hasStage(stage)) {
      return null
    }

    const path = this.getStagePath(stage)
    const content = readFileSync(path, 'utf-8')

    if (stage === 'chat') {
      return content as T
    }

    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && stageHasTimestamps(stage)) {
      restoreTimestamps(parsed)
    }

    return parsed as T
  }

  /**
   * Save output for a pipeline stage.
   */
  setStage<T>(stage: PipelineStage, data: T): void {
    const path = this.getStagePath(stage)

    if (stage === 'chat') {
      writeFileSync(path, data as string)
    } else {
      writeFileSync(path, JSON.stringify(data, null, 2))
    }
  }

  /**
   * Get the current run directory.
   */
  getRunDir(): string | null {
    return this.currentRun?.runDir ?? null
  }

  /**
   * Get current run metadata.
   */
  getCurrentRun(): PipelineRunMeta | null {
    return this.currentRun
  }

  /**
   * List all runs for an input file.
   */
  listRuns(inputFilename: string): PipelineRunMeta[] {
    const safeName = sanitizeFilename(basename(inputFilename, '.zip').replace('.txt', ''))
    const inputDir = join(this.chatsDir, safeName)

    if (!existsSync(inputDir)) {
      return []
    }

    const entries = readdirSync(inputDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const parts = e.name.split('-')
        const hash = parts.pop() ?? ''
        const datetime = parts.join('-')
        return {
          inputFile: inputFilename,
          fileHash: hash,
          createdAt: datetime,
          runDir: join(inputDir, e.name)
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
