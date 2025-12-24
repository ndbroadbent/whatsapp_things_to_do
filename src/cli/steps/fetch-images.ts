/**
 * Fetch Images Step
 *
 * Downloads images and resizes them to print-quality thumbnails (300 DPI).
 * For a 0.75" thumbnail at 300 DPI = 225px.
 *
 * Images are cached in ~/.cache/chat-to-map/images/:
 * - originals/<sanitized-url>-<hash>.jpg - Original downloaded images
 * - thumbnails/<sanitized-url>-<hash>.jpg - Resized thumbnails
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { generateImageFilename } from '../../cache/key'
import { httpFetch } from '../../http'
import type { ImageResult } from '../../images/types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

/** Thumbnail size in pixels (0.75" at 300 DPI) */
const THUMBNAIL_SIZE = 225

interface FetchImagesOptions {
  /** Size in pixels (default: 225 for 0.75" at 300 DPI) */
  readonly thumbnailSize?: number
  /** Concurrency for fetching (default: 5) */
  readonly concurrency?: number
}

interface FetchImagesResult {
  /** Thumbnails keyed by activityId */
  readonly thumbnails: Map<string, Buffer>
  /** Stats */
  readonly stats: {
    readonly total: number
    readonly fetched: number
    readonly failed: number
    readonly cached: number
  }
}

interface FetchTask {
  readonly activityId: string
  readonly url: string
  readonly filename: string
}

/**
 * Fetch and resize images to thumbnails.
 * Caches both originals and thumbnails to ~/.cache/chat-to-map/images/
 */
export async function stepFetchImages(
  ctx: PipelineContext,
  images: Map<string, ImageResult | null>,
  options?: FetchImagesOptions
): Promise<FetchImagesResult> {
  const size = options?.thumbnailSize ?? THUMBNAIL_SIZE
  const concurrency = options?.concurrency ?? 5
  const thumbnails = new Map<string, Buffer>()

  // Set up image cache directories
  const imagesDir = join(ctx.cacheDir, 'images')
  const originalsDir = join(imagesDir, 'originals')
  const thumbnailsDir = join(imagesDir, 'thumbnails')
  await mkdir(originalsDir, { recursive: true })
  await mkdir(thumbnailsDir, { recursive: true })

  // Build task list from entries with valid URLs
  const tasks: FetchTask[] = []
  for (const [activityId, image] of images) {
    if (image?.url) {
      tasks.push({
        activityId,
        url: image.url,
        filename: generateImageFilename(image.url)
      })
    }
  }

  if (tasks.length === 0) {
    ctx.logger.log(`\n🖼️  No images to fetch`)
    return {
      thumbnails,
      stats: { total: 0, fetched: 0, failed: 0, cached: 0 }
    }
  }

  // Check which thumbnails are already cached
  const uncachedTasks: FetchTask[] = []
  let cachedCount = 0

  for (const task of tasks) {
    const thumbnailPath = join(thumbnailsDir, task.filename)
    if (existsSync(thumbnailPath)) {
      const buffer = await readFile(thumbnailPath)
      thumbnails.set(task.activityId, buffer)
      cachedCount++
    } else {
      uncachedTasks.push(task)
    }
  }

  if (uncachedTasks.length === 0) {
    ctx.logger.log(`\n🖼️  Fetching thumbnails... 📦 cached`)
    return {
      thumbnails,
      stats: { total: tasks.length, fetched: 0, failed: 0, cached: cachedCount }
    }
  }

  ctx.logger.log(`\n🖼️  Fetching ${uncachedTasks.length} thumbnails...`)

  // Use worker pool for parallel fetching
  const { successes, errorCount } = await runWorkerPool(
    uncachedTasks,
    async (task) => {
      const result = await fetchAndResize(
        task.url,
        size,
        originalsDir,
        thumbnailsDir,
        task.filename
      )
      return { activityId: task.activityId, thumbnail: result }
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        const pct = Math.round((completed / total) * 100)
        if (completed % 10 === 0 || completed === total) {
          ctx.logger.log(`   ${pct}% fetched (${completed}/${total})`)
        }
      }
    }
  )

  // Collect successful thumbnails
  for (const result of successes) {
    if (result.thumbnail) {
      thumbnails.set(result.activityId, result.thumbnail)
    }
  }

  const stats = {
    total: tasks.length,
    fetched: successes.filter((r) => r.thumbnail).length,
    failed: errorCount + uncachedTasks.length - successes.filter((r) => r.thumbnail).length,
    cached: cachedCount
  }

  ctx.logger.log(
    `   ✓ ${stats.fetched} thumbnails fetched, ${stats.cached} cached, ${stats.failed} failed`
  )

  return { thumbnails, stats }
}

/**
 * Fetch an image URL, save original, and create thumbnail.
 */
async function fetchAndResize(
  url: string,
  size: number,
  originalsDir: string,
  thumbnailsDir: string,
  filename: string
): Promise<Buffer | null> {
  try {
    const originalPath = join(originalsDir, filename)
    const thumbnailPath = join(thumbnailsDir, filename)

    let originalBuffer: Buffer

    // Check if original is cached
    if (existsSync(originalPath)) {
      originalBuffer = await readFile(originalPath)
    } else {
      // Fetch the image
      const response = await httpFetch(url)
      if (!response.ok) return null

      const arrayBuffer = await response.arrayBuffer()
      originalBuffer = Buffer.from(arrayBuffer)

      // Save original
      await writeFile(originalPath, new Uint8Array(originalBuffer))
    }

    // Create thumbnail
    const thumbnail = await sharp(originalBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toBuffer()

    // Save thumbnail
    await writeFile(thumbnailPath, new Uint8Array(thumbnail))

    return thumbnail
  } catch {
    return null
  }
}
