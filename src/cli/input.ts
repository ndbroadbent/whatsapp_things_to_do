/**
 * CLI Input Handling
 *
 * Handles input file reading with caching and per-chat output directories.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { DEFAULT_CACHE_DIR, DEFAULT_OUTPUT_DIR } from './args.js'
import { readInputFile } from './io.js'

/**
 * Input file metadata for caching and output directory generation.
 */
export interface InputMetadata {
  /** Original file path */
  readonly path: string
  /** Base name without extension */
  readonly baseName: string
  /** File modification time in milliseconds */
  readonly mtime: number
  /** Short hash for uniqueness (8 chars) */
  readonly hash: string
  /** Per-chat output directory name */
  readonly outputDirName: string
}

/**
 * Generate a short hash from filename and mtime.
 */
function generateShortHash(filename: string, mtime: number): string {
  const input = `${filename}:${mtime}`
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

/**
 * Sanitize a filename for use as a directory name.
 * Removes unsafe characters and limits length.
 */
function sanitizeForDirectory(name: string): string {
  return name
    .replace(/\.zip$/i, '')
    .replace(/\.txt$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
}

/**
 * Get input file metadata for cache key generation and output directory naming.
 */
export async function getInputMetadata(filePath: string): Promise<InputMetadata> {
  const stats = await stat(filePath)
  const name = basename(filePath)
  const baseName = sanitizeForDirectory(name)
  const mtime = stats.mtimeMs
  const hash = generateShortHash(name, mtime)

  return {
    path: filePath,
    baseName,
    mtime,
    hash,
    outputDirName: `${baseName}-${hash}`
  }
}

/**
 * Get the full output directory path for a chat.
 */
export function getChatOutputDir(metadata: InputMetadata, baseOutputDir?: string): string {
  const base = baseOutputDir ?? DEFAULT_OUTPUT_DIR
  return join(base, metadata.outputDirName)
}

/**
 * Cache entry for extracted content.
 */
interface ContentCacheEntry {
  content: string
  mtime: number
  extractedAt: number
}

/**
 * Get the path to the cached extraction for a file.
 */
function getExtractionCachePath(metadata: InputMetadata, cacheDir?: string): string {
  const base = cacheDir ?? DEFAULT_CACHE_DIR
  return join(base, 'extractions', `${metadata.baseName}-${metadata.hash}.json`)
}

/**
 * Try to read cached extracted content.
 * Returns null if not cached or cache is invalid.
 */
export function getCachedExtraction(metadata: InputMetadata, cacheDir?: string): string | null {
  const cachePath = getExtractionCachePath(metadata, cacheDir)

  if (!existsSync(cachePath)) {
    return null
  }

  try {
    const raw = readFileSync(cachePath, 'utf-8')
    const entry = JSON.parse(raw) as ContentCacheEntry

    // Validate mtime matches (file hasn't changed)
    if (entry.mtime !== metadata.mtime) {
      return null
    }

    return entry.content
  } catch {
    return null
  }
}

/**
 * Cache extracted content for future use.
 */
export function cacheExtraction(metadata: InputMetadata, content: string, cacheDir?: string): void {
  const cachePath = getExtractionCachePath(metadata, cacheDir)
  const dir = join(cachePath, '..')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const entry: ContentCacheEntry = {
    content,
    mtime: metadata.mtime,
    extractedAt: Date.now()
  }

  writeFileSync(cachePath, JSON.stringify(entry))
}

/**
 * Read an input file with caching support.
 * For zip files, caches the extracted content by filename + mtime.
 */
export async function readInputFileWithCache(
  filePath: string,
  options?: { cacheDir?: string; skipCache?: boolean }
): Promise<{ content: string; metadata: InputMetadata; fromCache: boolean }> {
  const metadata = await getInputMetadata(filePath)
  const isZipFile = filePath.endsWith('.zip')

  // Check cache first for zip files (unless skipped)
  if (isZipFile && !options?.skipCache) {
    const cached = getCachedExtraction(metadata, options?.cacheDir)
    if (cached !== null) {
      return { content: cached, metadata, fromCache: true }
    }
  }

  // Use the shared readInputFile function to read the file
  const content = await readInputFile(filePath)

  // Cache zip extractions (they're expensive to re-extract)
  if (isZipFile) {
    cacheExtraction(metadata, content, options?.cacheDir)
  }

  return { content, metadata, fromCache: false }
}
