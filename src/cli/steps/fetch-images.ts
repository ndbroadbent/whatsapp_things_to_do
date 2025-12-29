/**
 * Fetch Images Step
 *
 * Downloads images and resizes them to multiple sizes:
 * - Thumbnail: 128×128 (square crop for activity list)
 * - Medium: 400×267 (3:2 for tooltip popup)
 * - Lightbox: 1400×933 (3:2 for full-size viewing)
 *
 * For media library URLs (media.chattomap.com), fetches pre-sized images directly.
 * For other sources (Pixabay, Google Places), downloads original and resizes.
 *
 * Images are cached in ~/.cache/chat-to-map/images/:
 * - originals/<filename>.jpg - Original downloaded images (non-CDN only)
 * - thumbnails/<filename>.jpg - 128×128 square
 * - medium/<filename>.jpg - 400×267 (3:2)
 * - lightbox/<filename>.jpg - 1400×933 (3:2)
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { generateImageFilename } from '../../caching/key'
import { httpFetch } from '../../http'
import type { ImageResult } from '../../images/types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

/** Image sizes matching media library */
const THUMBNAIL_SIZE = { width: 128, height: 128 } // square
const MEDIUM_SIZE = { width: 400, height: 267 } // 3:2
const LIGHTBOX_SIZE = { width: 1400, height: 933 } // 3:2

interface FetchImagesOptions {
  /** Concurrency for fetching (default: 5) */
  readonly concurrency?: number
}

interface FetchImagesResult {
  /** Thumbnails (128×128) keyed by activityId */
  readonly thumbnails: Map<string, Buffer>
  /** Medium images (400×267) keyed by activityId */
  readonly mediumImages: Map<string, Buffer>
  /** Lightbox images (1400×933) keyed by activityId */
  readonly lightboxImages: Map<string, Buffer>
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
  readonly isMediaLibrary: boolean
}

interface ResizedImages {
  readonly thumbnail: Buffer
  readonly medium: Buffer
  readonly lightbox: Buffer
}

/**
 * Save all three image sizes to disk.
 */
async function saveResizedImages(
  images: ResizedImages,
  thumbnailsDir: string,
  mediumDir: string,
  lightboxDir: string,
  filename: string
): Promise<void> {
  await Promise.all([
    writeFile(join(thumbnailsDir, filename), new Uint8Array(images.thumbnail)),
    writeFile(join(mediumDir, filename), new Uint8Array(images.medium)),
    writeFile(join(lightboxDir, filename), new Uint8Array(images.lightbox))
  ])
}

/**
 * Transform a media library URL to a different size.
 * e.g., .../abc123-700.jpg → .../abc123-128.jpg
 */
function getMediaLibrarySizeUrl(url: string, size: number): string {
  return url.replace(/-\d+\.jpg$/, `-${size}.jpg`)
}

/**
 * Fetch and resize images to thumbnails, medium, and lightbox sizes.
 * For media library URLs, fetches pre-sized images directly.
 * For other sources, downloads original and resizes.
 */
export async function stepFetchImages(
  ctx: PipelineContext,
  images: Map<string, ImageResult | null>,
  options?: FetchImagesOptions
): Promise<FetchImagesResult> {
  const concurrency = options?.concurrency ?? 5
  const thumbnails = new Map<string, Buffer>()
  const mediumImages = new Map<string, Buffer>()
  const lightboxImages = new Map<string, Buffer>()

  // Set up image cache directories
  const imagesDir = join(ctx.cacheDir, 'images')
  const originalsDir = join(imagesDir, 'originals')
  const thumbnailsDir = join(imagesDir, 'thumbnails')
  const mediumDir = join(imagesDir, 'medium')
  const lightboxDir = join(imagesDir, 'lightbox')
  await mkdir(originalsDir, { recursive: true })
  await mkdir(thumbnailsDir, { recursive: true })
  await mkdir(mediumDir, { recursive: true })
  await mkdir(lightboxDir, { recursive: true })

  // Build task list from entries with valid URLs
  const tasks: FetchTask[] = []
  for (const [activityId, image] of images) {
    if (image?.imageUrl) {
      tasks.push({
        activityId,
        url: image.imageUrl,
        filename: generateImageFilename(image.imageUrl),
        isMediaLibrary: image.fromMediaLibrary === true
      })
    }
  }

  if (tasks.length === 0) {
    ctx.logger.log(`\n🖼️  No images to fetch`)
    return {
      thumbnails,
      mediumImages,
      lightboxImages,
      stats: { total: 0, fetched: 0, failed: 0, cached: 0 }
    }
  }

  // Check which images are already cached (need all three sizes)
  const uncachedTasks: FetchTask[] = []
  let cachedCount = 0

  for (const task of tasks) {
    const thumbnailPath = join(thumbnailsDir, task.filename)
    const mediumPath = join(mediumDir, task.filename)
    const lightboxPath = join(lightboxDir, task.filename)

    if (existsSync(thumbnailPath) && existsSync(mediumPath) && existsSync(lightboxPath)) {
      const thumbBuffer = await readFile(thumbnailPath)
      const mediumBuffer = await readFile(mediumPath)
      const lightboxBuffer = await readFile(lightboxPath)
      thumbnails.set(task.activityId, thumbBuffer)
      mediumImages.set(task.activityId, mediumBuffer)
      lightboxImages.set(task.activityId, lightboxBuffer)
      cachedCount++
    } else {
      uncachedTasks.push(task)
    }
  }

  if (uncachedTasks.length === 0) {
    ctx.logger.log(`\n🖼️  Fetching images... 📦 cached`)
    return {
      thumbnails,
      mediumImages,
      lightboxImages,
      stats: { total: tasks.length, fetched: 0, failed: 0, cached: cachedCount }
    }
  }

  ctx.logger.log(`\n🖼️  Fetching ${uncachedTasks.length} images...`)

  // Use worker pool for parallel fetching
  const { successes, errorCount } = await runWorkerPool(
    uncachedTasks,
    async (task) => {
      const result = task.isMediaLibrary
        ? await fetchMediaLibraryImages(
            task.url,
            thumbnailsDir,
            mediumDir,
            lightboxDir,
            task.filename
          )
        : await fetchAndResize(
            task.url,
            originalsDir,
            thumbnailsDir,
            mediumDir,
            lightboxDir,
            task.filename
          )
      return { activityId: task.activityId, images: result }
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

  // Collect successful images
  for (const result of successes) {
    if (result.images) {
      thumbnails.set(result.activityId, result.images.thumbnail)
      mediumImages.set(result.activityId, result.images.medium)
      lightboxImages.set(result.activityId, result.images.lightbox)
    }
  }

  const stats = {
    total: tasks.length,
    fetched: successes.filter((r) => r.images).length,
    failed: errorCount + uncachedTasks.length - successes.filter((r) => r.images).length,
    cached: cachedCount
  }

  ctx.logger.log(
    `   ✓ ${stats.fetched} images fetched, ${stats.cached} cached, ${stats.failed} failed`
  )

  return { thumbnails, mediumImages, lightboxImages, stats }
}

/**
 * Fetch pre-sized images from media library CDN.
 * No resizing needed - images are already the correct sizes.
 */
async function fetchMediaLibraryImages(
  url: string,
  thumbnailsDir: string,
  mediumDir: string,
  lightboxDir: string,
  filename: string
): Promise<ResizedImages | null> {
  try {
    const thumbnailUrl = getMediaLibrarySizeUrl(url, 128)
    const mediumUrl = getMediaLibrarySizeUrl(url, 400)
    const lightboxUrl = getMediaLibrarySizeUrl(url, 1400)

    // Fetch all three sizes in parallel
    const [thumbResponse, mediumResponse, lightboxResponse] = await Promise.all([
      httpFetch(thumbnailUrl),
      httpFetch(mediumUrl),
      httpFetch(lightboxUrl)
    ])

    if (!thumbResponse.ok || !mediumResponse.ok || !lightboxResponse.ok) {
      return null
    }

    const [thumbArray, mediumArray, lightboxArray] = await Promise.all([
      thumbResponse.arrayBuffer(),
      mediumResponse.arrayBuffer(),
      lightboxResponse.arrayBuffer()
    ])

    const images: ResizedImages = {
      thumbnail: Buffer.from(thumbArray),
      medium: Buffer.from(mediumArray),
      lightbox: Buffer.from(lightboxArray)
    }

    await saveResizedImages(images, thumbnailsDir, mediumDir, lightboxDir, filename)
    return images
  } catch {
    return null
  }
}

/**
 * Fetch an image URL from external source, save original, and resize to all sizes.
 */
async function fetchAndResize(
  url: string,
  originalsDir: string,
  thumbnailsDir: string,
  mediumDir: string,
  lightboxDir: string,
  filename: string
): Promise<ResizedImages | null> {
  try {
    const originalPath = join(originalsDir, filename)

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

    // Create all sizes in parallel
    const [thumbnail, medium, lightbox] = await Promise.all([
      // Thumbnail: square crop (128×128)
      sharp(originalBuffer)
        .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer(),
      // Medium: 3:2 aspect (400×267)
      sharp(originalBuffer)
        .resize(MEDIUM_SIZE.width, MEDIUM_SIZE.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer(),
      // Lightbox: 3:2 aspect (700×467)
      sharp(originalBuffer)
        .resize(LIGHTBOX_SIZE.width, LIGHTBOX_SIZE.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer()
    ])

    const images: ResizedImages = { thumbnail, medium, lightbox }
    await saveResizedImages(images, thumbnailsDir, mediumDir, lightboxDir, filename)
    return images
  } catch {
    return null
  }
}
