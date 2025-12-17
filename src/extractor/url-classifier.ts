/**
 * URL Classifier
 *
 * Classifies URLs by type for confidence boosting.
 */

import type { UrlType } from '../types.js'

interface UrlClassifierRule {
  readonly patterns: readonly (string | RegExp)[]
  readonly type: UrlType
}

const URL_CLASSIFIER_RULES: readonly UrlClassifierRule[] = [
  {
    patterns: ['maps.google', 'goo.gl/maps', 'maps.app.goo.gl', 'google.com/maps'],
    type: 'google_maps'
  },
  {
    patterns: ['tiktok.com', 'vt.tiktok', 'vm.tiktok'],
    type: 'tiktok'
  },
  {
    patterns: ['youtube.com', 'youtu.be', 'music.youtube'],
    type: 'youtube'
  },
  {
    patterns: ['instagram.com', 'instagr.am'],
    type: 'instagram'
  },
  {
    patterns: ['airbnb.com', 'airbnb.co'],
    type: 'airbnb'
  },
  {
    patterns: ['booking.com'],
    type: 'booking'
  },
  {
    patterns: ['tripadvisor.com', 'tripadvisor.co'],
    type: 'tripadvisor'
  },
  {
    patterns: ['eventfinda', 'ticketmaster', 'eventbrite', 'meetup.com', 'facebook.com/events'],
    type: 'event'
  }
]

/**
 * Classify a URL by type.
 */
export function classifyUrl(url: string): UrlType {
  const urlLower = url.toLowerCase()

  for (const rule of URL_CLASSIFIER_RULES) {
    for (const pattern of rule.patterns) {
      if (typeof pattern === 'string') {
        if (urlLower.includes(pattern)) {
          return rule.type
        }
      } else if (pattern.test(urlLower)) {
        return rule.type
      }
    }
  }

  return 'website'
}

/**
 * Check if a URL is activity-related (higher confidence).
 */
export function isActivityUrl(url: string): boolean {
  const type = classifyUrl(url)
  return ['google_maps', 'airbnb', 'booking', 'tripadvisor', 'event'].includes(type)
}

/**
 * Extract Google Maps coordinates from URL if present.
 */
export function extractGoogleMapsCoords(url: string): { lat: number; lng: number } | null {
  // Pattern: @lat,lng,zoom
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (atMatch) {
    const lat = Number.parseFloat(atMatch[1] ?? '0')
    const lng = Number.parseFloat(atMatch[2] ?? '0')
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng }
    }
  }

  // Pattern: q=lat,lng
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (qMatch) {
    const lat = Number.parseFloat(qMatch[1] ?? '0')
    const lng = Number.parseFloat(qMatch[2] ?? '0')
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng }
    }
  }

  // Pattern: ll=lat,lng
  const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (llMatch) {
    const lat = Number.parseFloat(llMatch[1] ?? '0')
    const lng = Number.parseFloat(llMatch[2] ?? '0')
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng }
    }
  }

  return null
}
