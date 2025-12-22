/**
 * Pipeline Cache (Layer 1)
 *
 * Per-run pipeline cache that stores outputs for each pipeline step.
 * Organized by input file with datetime and content hash for versioning.
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
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export type PipelineStage =
  | 'chat'
  | 'messages'
  | 'candidates.heuristics'
  | 'candidates.embeddings'
  | 'candidates.all'
  | 'scraped_urls'
  | 'classifications'
  | 'geocodings'

interface PipelineRunMeta {
  inputFile: string
  contentHash: string
  createdAt: string
  runDir: string
}

/**
 * Calculate SHA256 hash of content.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
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
 * Pipeline cache for per-run stage outputs.
 */
export class PipelineCache {
  private readonly chatsDir: string
  private currentRun: PipelineRunMeta | null = null

  constructor(cacheDir: string) {
    this.chatsDir = join(cacheDir, 'chats')
  }

  /**
   * Initialize a new pipeline run for an input file.
   * Creates the run directory based on datetime and content hash.
   */
  initRun(inputFilename: string, content: string): PipelineRunMeta {
    const hash = hashContent(content)
    const datetime = formatDatetimeForDir()
    const safeName = sanitizeFilename(basename(inputFilename, '.zip').replace('.txt', ''))
    const runDirName = `${datetime}-${hash}`
    const runDir = join(this.chatsDir, safeName, runDirName)

    if (!existsSync(runDir)) {
      mkdirSync(runDir, { recursive: true })
    }

    this.currentRun = {
      inputFile: inputFilename,
      contentHash: hash,
      createdAt: datetime,
      runDir
    }

    return this.currentRun
  }

  /**
   * Find the most recent run for a given input file and content hash.
   * Returns null if no matching run exists.
   */
  findLatestRun(inputFilename: string, content: string): PipelineRunMeta | null {
    const hash = hashContent(content)
    const safeName = sanitizeFilename(basename(inputFilename, '.zip').replace('.txt', ''))
    const inputDir = join(this.chatsDir, safeName)

    if (!existsSync(inputDir)) {
      return null
    }

    // Find all run directories matching this hash
    const entries = readdirSync(inputDir, { withFileTypes: true })
    const matchingRuns = entries
      .filter((e) => e.isDirectory() && e.name.endsWith(`-${hash}`))
      .map((e) => e.name)
      .sort()
      .reverse()

    if (matchingRuns.length === 0) {
      return null
    }

    const latestRunDir = matchingRuns[0]
    if (!latestRunDir) {
      return null
    }

    const datetime = latestRunDir.slice(0, 19)
    this.currentRun = {
      inputFile: inputFilename,
      contentHash: hash,
      createdAt: datetime,
      runDir: join(inputDir, latestRunDir)
    }

    return this.currentRun
  }

  /**
   * Find or create a run for this input.
   * Reuses existing run if content hash matches, otherwise creates new.
   */
  getOrCreateRun(inputFilename: string, content: string): PipelineRunMeta {
    const existing = this.findLatestRun(inputFilename, content)
    if (existing) {
      return existing
    }
    return this.initRun(inputFilename, content)
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

    return JSON.parse(content) as T
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
          contentHash: hash,
          createdAt: datetime,
          runDir: join(inputDir, e.name)
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
