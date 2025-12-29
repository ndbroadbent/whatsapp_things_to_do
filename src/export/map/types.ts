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
  /** Link to source page */
  url: string
  /** License (e.g., "CC-BY-SA 4.0") */
  license: string | undefined
  /** Formatted attribution text (e.g., "Photo by X on Unsplash") */
  text: string
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
