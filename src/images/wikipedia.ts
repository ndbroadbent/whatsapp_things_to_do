/**
 * Wikipedia Image Fetching
 *
 * Fetches images from Wikipedia/Wikimedia Commons for landmarks, cities, and countries.
 * Uses the Wikipedia Action API to get proper license metadata.
 *
 * ⚠️ LEGAL NOTICE: Only CC/PD licensed images are used.
 * Fair use images are NOT safe outside Wikipedia context.
 * See wikipedia-license.ts for allowed/blocked license patterns.
 *
 * API: https://en.wikipedia.org/w/api.php
 */

import { generateImageCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import { httpFetch } from '../http'
import type { GeocodedActivity } from '../types/geocoder'
import { cacheNull, cacheResult, getCached } from './cache-helper'
import type { ImageResult } from './types'
import { isLicenseAllowed } from './wikipedia-license'

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'ChatToMap/1.0 (https://chattomap.com)'
const MIN_IMAGE_WIDTH = 400

/**
 * Fetch Wikipedia image for an activity.
 *
 * Tries venue, then city, then country.
 * Only returns images with CC/PD licenses.
 */
export async function fetchWikipediaImage(
  activity: GeocodedActivity,
  cache: ResponseCache
): Promise<ImageResult | null> {
  // Try venue first (most specific)
  if (activity.venue) {
    const result = await fetchWikipediaArticleImage(activity.venue, cache)
    if (result) return result
  }

  // Try city
  if (activity.city) {
    const result = await fetchWikipediaArticleImage(activity.city, cache)
    if (result) return result
  }

  // Try country
  if (activity.country) {
    const result = await fetchWikipediaArticleImage(activity.country, cache)
    if (result) return result
  }

  return null
}

/**
 * Wikipedia API response types
 */
interface WikipediaQueryResponse {
  query: {
    normalized?: Array<{ from: string; to: string }>
    redirects?: Array<{ from: string; to: string }>
    pages: Record<
      string,
      {
        pageid?: number
        title: string
        missing?: string
        images?: Array<{ title: string }>
      }
    >
  }
}

interface WikipediaImageInfoResponse {
  query: {
    pages: Record<
      string,
      {
        title: string
        imageinfo?: Array<{
          url: string
          descriptionurl: string
          width: number
          height: number
          extmetadata?: {
            ImageDescription?: { value: string }
            Artist?: { value: string }
            LicenseShortName?: { value: string }
            LicenseUrl?: { value: string }
          }
        }>
      }
    >
  }
}

/**
 * Fetch the main image from a Wikipedia article with license checking.
 */
async function fetchWikipediaArticleImage(
  title: string,
  cache: ResponseCache
): Promise<ImageResult | null> {
  const cacheKey = generateImageCacheKey('wikipedia', title)

  const cached = await getCached<ImageResult>(cache, cacheKey)
  if (cached.hit) {
    return cached.data
  }

  try {
    // Step 1: Find the article and get its images
    const articleTitle = await findArticle(title)
    if (!articleTitle) {
      await cacheNull(cache, cacheKey)
      return null
    }

    // Step 2: Get image list from article
    const imageNames = await getArticleImageNames(articleTitle)
    if (imageNames.length === 0) {
      await cacheNull(cache, cacheKey)
      return null
    }

    // Step 3: Find first image with valid license
    for (const imageName of imageNames) {
      const result = await getImageWithLicense(imageName)
      if (result) {
        await cacheResult(cache, cacheKey, result)
        return result
      }
    }

    // No valid images found
    await cacheNull(cache, cacheKey)
    return null
  } catch {
    await cacheNull(cache, cacheKey)
    return null
  }
}

/**
 * Find Wikipedia article by title, following redirects.
 */
async function findArticle(query: string): Promise<string | null> {
  // Convert to Wikipedia title format
  const wikiTitle = query
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_')

  const params = new URLSearchParams({
    action: 'query',
    titles: wikiTitle,
    redirects: '1', // Follow redirects to get canonical title
    format: 'json'
  })

  const response = await httpFetch(`${WIKIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': USER_AGENT }
  })

  if (!response.ok) return null

  const data = (await response.json()) as WikipediaQueryResponse
  const pages = Object.values(data.query.pages)
  if (pages.length === 0) return null

  const page = pages[0]
  if (page?.missing !== undefined) return null

  return page?.title ?? null
}

/**
 * Get list of image names from an article.
 * Filters out SVGs, GIFs, logos, icons, flags.
 */
async function getArticleImageNames(articleTitle: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    titles: articleTitle,
    prop: 'images',
    imlimit: '20', // Get first 20 images
    format: 'json'
  })

  const response = await httpFetch(`${WIKIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': USER_AGENT }
  })

  if (!response.ok) return []

  const data = (await response.json()) as WikipediaQueryResponse
  const page = Object.values(data.query.pages)[0]
  if (!page?.images) return []

  // Filter out non-photo images
  return page.images
    .map((img) => img.title)
    .filter((name) => {
      const lower = name.toLowerCase()
      if (lower.endsWith('.svg')) return false
      if (lower.endsWith('.gif')) return false
      if (lower.includes('logo')) return false
      if (lower.includes('icon')) return false
      if (lower.includes('flag')) return false
      if (lower.includes('coat_of_arms')) return false
      if (lower.includes('commons-logo')) return false
      return true
    })
}

/**
 * Get image info with license, returning null if license not allowed.
 */
async function getImageWithLicense(imageTitle: string): Promise<ImageResult | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: imageTitle,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    format: 'json'
  })

  const response = await httpFetch(`${WIKIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': USER_AGENT }
  })

  if (!response.ok) return null

  const data = (await response.json()) as WikipediaImageInfoResponse
  const page = Object.values(data.query.pages)[0]
  if (!page?.imageinfo?.[0]) return null

  const info = page.imageinfo[0]
  const meta = info.extmetadata ?? {}

  // Check image size
  if (info.width < MIN_IMAGE_WIDTH) return null

  // Get license and check if allowed
  const license = meta.LicenseShortName?.value ?? ''
  const licenseCheck = isLicenseAllowed(license)

  if (!licenseCheck.allowed) {
    // Log warnings for unrecognized licenses so we can add them
    if (licenseCheck.warn) {
      console.warn(`[wikipedia] Unrecognized license "${license}" for ${imageTitle}`)
    }
    return null
  }

  // Extract artist name from HTML
  const artistHtml = meta.Artist?.value ?? ''
  const artistName = cleanHtml(artistHtml) || 'Unknown'

  return {
    url: info.url,
    width: info.width,
    height: info.height,
    source: 'wikipedia',
    attribution: {
      name: artistName,
      url: info.descriptionurl,
      license: license,
      licenseUrl: meta.LicenseUrl?.value
    }
  }
}

/**
 * Clean HTML tags from a string.
 */
function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
