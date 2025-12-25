/**
 * Map List HTML Export
 *
 * Generate a list-only HTML page when no geocoded points are available.
 * Shows all activities in a nice list format with category emojis.
 */

import { CATEGORY_EMOJI, formatLocation, type GeocodedActivity, type MapConfig } from '../types'
import { formatDate } from './utils'

/**
 * Escape a string for use in HTML/JavaScript.
 */
function escapeJS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

/**
 * Generate a list-only HTML page when no geocoded points are available.
 */
export function generateListOnlyHTML(
  suggestions: readonly GeocodedActivity[],
  config: MapConfig
): string {
  const title = config.title ?? 'Things To Do'

  const listItems = suggestions
    .map((s) => {
      const emoji = CATEGORY_EMOJI[s.category] ?? '📍'
      const firstMessage = s.messages[0]
      const date = formatDate(firstMessage?.timestamp)
      const sender = firstMessage?.sender ?? 'Unknown'
      const loc = formatLocation(s)
      const location = loc ? `<span class="location">${escapeJS(loc)}</span>` : ''
      return `
        <div class="item">
          <span class="emoji">${emoji}</span>
          <div class="content">
            <div class="activity">${escapeJS(s.activity)}</div>
            <div class="meta">${date} • ${escapeJS(sender)}${location ? ` • ${location}` : ''}</div>
          </div>
        </div>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; margin-bottom: 10px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .note {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .note strong { color: #856404; }
    .item {
      display: flex;
      background: white;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .emoji { font-size: 24px; margin-right: 15px; }
    .content { flex: 1; }
    .activity { font-weight: 500; color: #333; margin-bottom: 5px; }
    .meta { font-size: 13px; color: #666; }
    .location { color: #0066cc; }
  </style>
</head>
<body>
  <h1>${escapeJS(title)}</h1>
  <p class="subtitle">${suggestions.length} activities found</p>

  <div class="note">
    <strong>Note:</strong> Map view requires geocoding. Set <code>GOOGLE_MAPS_API_KEY</code>
    environment variable to enable location mapping.
  </div>

  ${listItems}
</body>
</html>`
}
