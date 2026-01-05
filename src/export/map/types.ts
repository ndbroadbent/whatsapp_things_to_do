/**
 * Map Export Types
 */

import type { ActivityCategory } from '../../categories'

interface MapMessage {
  sender: string
  date: string
  message: string
}

/** Attribution info for display in map popups */
export interface MapImageAttribution {
  /** Artist/photographer name */
  name: string
  /** Link to the photo page */
  photoUrl: string
  /** Link to the author's profile (may be undefined for Google Places) */
  authorUrl: string | undefined
  /** License (only for Wikipedia) */
  license: string | undefined
  /** Source platform */
  source: 'wikipedia' | 'unsplash' | 'pixabay' | 'google_places'
}

/** Link preview for display in activity rows */
export interface MapLinkPreview {
  /** Canonical URL to link to */
  url: string
  /** Page title from og:title or entity resolution */
  title: string | null
  /** Description from og:description or entity data */
  description: string | null
  /** Image URL from og:image (for preview widget) */
  imageUrl: string | null
  /** Domain for display (e.g., "imdb.com") */
  domain: string
}

export interface MapActivity {
  lat: number | null
  lng: number | null
  sender: string
  activity: string
  activityId: string
  category: ActivityCategory
  location: string
  date: string
  score: number
  url: string | null
  color: string
  /** Thumbnail path (128×128) for activity list */
  imagePath: string | null
  /** Medium image path (400×267) for popup */
  mediumImagePath: string | null
  /** Lightbox image path (1400×933) for full-size view */
  lightboxImagePath: string | null
  /** Image attribution (for Wikipedia, Unsplash, etc.) */
  imageAttribution: MapImageAttribution | null
  placeId: string | null
  messages: MapMessage[]
  /** Link preview for display (resolved entity or scraped URL) */
  linkPreview: MapLinkPreview | null
}

export interface MapData {
  title: string
  center: { lat: number; lng: number }
  zoom: number
  clusterMarkers: boolean
  defaultStyle: 'osm' | 'satellite' | 'terrain'
  /** Whether images are enabled (determines thumbnail rendering) */
  hasImages: boolean
  /** All activities (filter by lat/lng !== null for map pins) */
  activities: MapActivity[]
  senderColors: Record<string, string>
  /** Lucide SVG icons keyed by category */
  categoryIcons: Record<string, string>
  /** Background colors keyed by category */
  categoryColors: Record<string, string>
}
