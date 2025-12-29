/**
 * Map Export Module
 *
 * Generates an interactive HTML map with separate data.js and app.js files.
 */

import type { GeocodedActivity, MapConfig } from '../../types'
import { generateListOnlyHTML } from '../map-list-html'
import ACTIVITY_LIST_JS from './activity-list.js.template' with { type: 'text' }
import APP_JS from './app.js.template' with { type: 'text' }
import { toMapData } from './data'
import LIGHTBOX_JS from './lightbox.js.template' with { type: 'text' }
import MARKERS_JS from './markers.js.template' with { type: 'text' }
import { generateMapHTML } from './template'
import TILES_JS from './tiles.js.template' with { type: 'text' }
import TOOLTIP_JS from './tooltip.js.template' with { type: 'text' }
import type { MapData } from './types'

/** Combined app JS from all modules */
const COMBINED_APP_JS = [
  TOOLTIP_JS,
  TILES_JS,
  MARKERS_JS,
  ACTIVITY_LIST_JS,
  LIGHTBOX_JS,
  APP_JS
].join('\n\n')

/**
 * Generate map data JavaScript file content.
 */
function generateDataJS(mapData: MapData): string {
  return `var mapData = ${JSON.stringify(mapData, null, 2)};`
}

/**
 * Generate a single self-contained HTML file with all JS inline.
 * For backward compatibility and single-file downloads.
 */
export function exportToMapHTML(
  activities: readonly GeocodedActivity[],
  config: MapConfig = {}
): string {
  const mapData = toMapData(activities, config)

  // If no geocoded activities, show list-only view
  const hasGeocodedActivities = mapData.activities.some((a) => a.lat !== null && a.lng !== null)
  if (!hasGeocodedActivities) {
    return generateListOnlyHTML(activities, config)
  }

  const dataJS = generateDataJS(mapData)

  return generateMapHTML({ inline: { data: dataJS, app: COMBINED_APP_JS } })
}
