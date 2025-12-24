/**
 * CDN Default Images
 *
 * Fetches default category/activity images from the ChatToMap CDN.
 * These are hand-picked images served from media.chattomap.com.
 *
 * URL patterns:
 * - https://media.chattomap.com/images/defaults/categories/{category}.jpg
 * - https://media.chattomap.com/images/defaults/categories/{category}/{action}.jpg
 * - https://media.chattomap.com/images/defaults/actions/{action}.jpg
 */

import { httpFetch } from '../http'
import type { ActivityCategory } from '../types'
import type { GeocodedActivity } from '../types/geocoder'
import type { ImageResult } from './types'

const CDN_BASE = 'https://media.chattomap.com/images/defaults'

/**
 * Build CDN URL for a category image.
 */
function buildCategoryUrl(category: ActivityCategory): string {
  return `${CDN_BASE}/categories/${category}.jpg`
}

/**
 * Build CDN URL for a category + action image.
 */
function buildCategoryActionUrl(category: ActivityCategory, action: string): string {
  return `${CDN_BASE}/categories/${category}/${action}.jpg`
}

/**
 * Build CDN URL for a standalone action image.
 */
function buildActionUrl(action: string): string {
  return `${CDN_BASE}/actions/${action}.jpg`
}

/**
 * Fetch default image from CDN for an activity.
 *
 * Priority (most specific first):
 * 1. Category + action (e.g., /categories/nature/hike.jpg)
 * 2. Action standalone (e.g., /actions/hike.jpg)
 * 3. Category fallback (e.g., /categories/nature.jpg)
 *
 * Returns null if no default exists or CDN is unavailable.
 */
export async function fetchCdnDefaultImage(
  activity: GeocodedActivity
): Promise<ImageResult | null> {
  const { category, action } = activity

  // 1. Try category + action specific
  if (action) {
    const url = buildCategoryActionUrl(category, action)
    const result = await checkCdnUrl(url)
    if (result) return result
  }

  // 2. Try action standalone
  if (action) {
    const url = buildActionUrl(action)
    const result = await checkCdnUrl(url)
    if (result) return result
  }

  // 3. Fall back to category
  const url = buildCategoryUrl(category)
  return checkCdnUrl(url)
}

/**
 * Check if a CDN URL exists and return ImageResult.
 */
async function checkCdnUrl(url: string): Promise<ImageResult | null> {
  try {
    // HEAD request to check if image exists
    const response = await httpFetch(url, { method: 'HEAD' })

    if (!response.ok) {
      return null
    }

    return {
      url,
      source: 'cdn' as const
    }
  } catch {
    return null
  }
}
