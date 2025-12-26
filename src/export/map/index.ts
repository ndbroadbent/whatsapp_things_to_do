/**
 * Map Export Module
 *
 * Generates an interactive HTML map with separate data.js and app.js files.
 */

import type { GeocodedActivity, MapConfig } from '../../types'
import { generateListOnlyHTML } from '../map-list-html'
import APP_JS from './app.js.template' with { type: 'text' }
import { toMapData } from './data'
import { generateMapHTML } from './template'
import type { MapData } from './types'

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

  if (mapData.points.length === 0) {
    return generateListOnlyHTML(activities, config)
  }

  const dataJS = generateDataJS(mapData)

  return generateMapHTML({ inline: { data: dataJS, app: APP_JS } })
}
