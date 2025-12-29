/**
 * Map Data Transformation
 *
 * Converts GeocodedActivity[] to MapData for the map template.
 */

import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../categories'
import {
  formatLocation,
  type GeocodedActivity,
  type ImageAttribution,
  type MapConfig
} from '../../types'
import { formatDate } from '../utils'
import type { MapActivity, MapData, MapImageAttribution } from './types'
import { calculateCenter, DEFAULT_ZOOM, extractUrl, MARKER_COLORS } from './utils'

/**
 * Convert geocoded activities to map data structure.
 */
export function toMapData(
  activities: readonly GeocodedActivity[],
  config: MapConfig = {}
): MapData {
  const { activities: mapActivities, senderColors } = toMapActivities(activities, config)

  // Calculate center from geocoded activities only
  const geocoded = mapActivities.filter(
    (a): a is typeof a & { lat: number; lng: number } => a.lat !== null && a.lng !== null
  )
  const calculatedCenter = calculateCenter(geocoded)
  const center = {
    lat: config.centerLat ?? calculatedCenter.lat,
    lng: config.centerLng ?? calculatedCenter.lng
  }

  return {
    title: config.title ?? 'Things To Do Map',
    center,
    zoom: config.zoom ?? DEFAULT_ZOOM,
    clusterMarkers: config.clusterMarkers !== false,
    defaultStyle: config.defaultStyle ?? 'osm',
    hasImages: config.imagePaths !== undefined && config.imagePaths.size > 0,
    activities: mapActivities,
    senderColors: Object.fromEntries(senderColors),
    categoryIcons: CATEGORY_ICONS,
    categoryColors: CATEGORY_COLORS
  }
}

/**
 * Convert ALL activities to map activities with sender colors.
 * Activities without lat/lng have null values (shown in list but not on map).
 */
function toMapActivities(
  activities: readonly GeocodedActivity[],
  config: MapConfig
): { activities: MapActivity[]; senderColors: Map<string, string> } {
  // Get unique senders and assign colors
  const senders = [...new Set(activities.flatMap((s) => s.messages.map((m) => m.sender)))]
  const senderColors = new Map<string, string>()

  for (let i = 0; i < senders.length; i++) {
    const sender = senders[i]
    if (sender) {
      senderColors.set(sender, MARKER_COLORS[i % MARKER_COLORS.length] ?? 'blue')
    }
  }

  const result: MapActivity[] = []

  for (const s of activities) {
    const firstMessage = s.messages[0]
    const sender = firstMessage?.sender ?? 'Unknown'
    const color = config.colorBySender !== false ? (senderColors.get(sender) ?? 'blue') : 'blue'

    const attribution = config.imageAttributions?.get(s.activityId)

    result.push({
      lat: s.latitude ?? null,
      lng: s.longitude ?? null,
      sender,
      activity: s.activity.slice(0, 100),
      activityId: s.activityId,
      category: s.category,
      location: formatLocation(s) ?? '',
      date: formatDate(firstMessage?.timestamp),
      score: s.score,
      url: firstMessage ? extractUrl(firstMessage.message) : null,
      color,
      imagePath: config.imagePaths?.get(s.activityId) ?? null,
      imageAttribution: attribution ? formatAttribution(attribution) : null,
      placeId: s.placeId ?? null,
      messages: s.messages.map((m) => ({
        sender: m.sender,
        date: formatDate(m.timestamp),
        message: m.message.slice(0, 200)
      }))
    })
  }

  return { activities: result, senderColors }
}

/**
 * Format attribution info for display.
 * Creates user-friendly text like "Photo by X on Unsplash" or "Photo by X via Wikipedia (CC-BY-SA)"
 */
function formatAttribution(attr: ImageAttribution): MapImageAttribution {
  let text: string

  switch (attr.source) {
    case 'unsplash':
      text = `Photo by ${attr.name} on Unsplash`
      break
    case 'wikipedia':
      text = attr.license ? `Photo by ${attr.name} (${attr.license})` : `Photo by ${attr.name}`
      break
    case 'pixabay':
      text = `Photo by ${attr.name} on Pixabay`
      break
    case 'media_library':
      // Media library images may have various sources
      text = attr.name
      break
    default:
      text = `Photo by ${attr.name}`
  }

  return {
    name: attr.name,
    url: attr.url,
    license: attr.license,
    text
  }
}
