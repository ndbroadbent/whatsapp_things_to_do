/**
 * Map HTML Export
 *
 * Generate an interactive HTML map using Leaflet.js.
 */

import { CATEGORY_EMOJI, formatLocation, type GeocodedActivity, type MapConfig } from '../types'

const DEFAULT_ZOOM = 6
const MARKER_COLORS = [
  'blue',
  'red',
  'green',
  'purple',
  'orange',
  'darkred',
  'darkblue',
  'darkgreen'
]

interface MapPoint {
  lat: number
  lng: number
  sender: string
  activity: string
  activityId: string
  location: string
  date: string
  score: number
  url: string | null
  color: string
  imagePath: string | null
  placeId: string | null
}

/**
 * Escape a string for use in JavaScript.
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
 * Calculate the center point from a list of coordinates.
 */
function calculateCenter(points: readonly MapPoint[]): { lat: number; lng: number } {
  if (points.length === 0) {
    return { lat: 0, lng: 0 }
  }

  const sumLat = points.reduce((sum, p) => sum + p.lat, 0)
  const sumLng = points.reduce((sum, p) => sum + p.lng, 0)

  return {
    lat: sumLat / points.length,
    lng: sumLng / points.length
  }
}

/**
 * Extract URL from message text.
 */
function extractUrl(message: string): string | null {
  const match = message.match(/https?:\/\/[^\s]+/i)
  return match ? match[0] : null
}

/**
 * Convert suggestions to map points with sender colors.
 */
function toMapPoints(
  suggestions: readonly GeocodedActivity[],
  config: MapConfig
): { points: MapPoint[]; senderColors: Map<string, string> } {
  // Get unique senders and assign colors
  const senders = [...new Set(suggestions.map((s) => s.sender))]
  const senderColors = new Map<string, string>()

  for (let i = 0; i < senders.length; i++) {
    const sender = senders[i]
    if (sender) {
      senderColors.set(sender, MARKER_COLORS[i % MARKER_COLORS.length] ?? 'blue')
    }
  }

  // Filter to geocoded suggestions and convert to points
  const points: MapPoint[] = []

  for (const s of suggestions) {
    if (s.latitude === undefined || s.longitude === undefined) {
      continue
    }

    const color = config.colorBySender !== false ? (senderColors.get(s.sender) ?? 'blue') : 'blue'

    points.push({
      lat: s.latitude,
      lng: s.longitude,
      sender: s.sender,
      activity: s.activity.slice(0, 100),
      activityId: s.activityId,
      location: formatLocation(s) ?? '',
      date: s.timestamp.toISOString().split('T')[0] ?? '',
      score: s.score,
      url: extractUrl(s.originalMessage),
      color,
      imagePath: config.imagePaths?.get(s.activityId) ?? null,
      placeId: s.placeId ?? null
    })
  }

  return { points, senderColors }
}

/**
 * Generate marker JavaScript code.
 */
function generateMarkersJS(points: readonly MapPoint[]): string {
  return points
    .map((p) => {
      const senderName = p.sender.split(' ')[0] ?? p.sender
      const imageHtml = p.imagePath
        ? `<img src="${escapeJS(p.imagePath)}" style="width:100%;max-width:200px;border-radius:4px;margin-bottom:8px;" />`
        : ''
      const mapsUrl = p.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.activity)}&query_place_id=${p.placeId}`
        : null
      const popupContent = `
        <div style="max-width: 220px;">
          ${imageHtml}
          <strong>${escapeJS(p.activity)}</strong><br>
          <small>${p.date} - ${escapeJS(senderName)}</small><br>
          ${p.location ? `<em>${escapeJS(p.location)}</em><br>` : ''}
          ${mapsUrl ? `<a href="${escapeJS(mapsUrl)}" target="_blank">View on Google Maps</a><br>` : ''}
          ${p.url ? `<a href="${escapeJS(p.url)}" target="_blank">Source Link</a>` : ''}
        </div>
      `
        .replace(/\n/g, '')
        .replace(/\s+/g, ' ')

      return `
        L.marker([${p.lat}, ${p.lng}], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background-color: ${p.color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(markersLayer).bindPopup('${popupContent}');
      `
    })
    .join('\n')
}

/**
 * Generate legend HTML.
 */
function generateLegendHTML(senderColors: Map<string, string>): string {
  const items = [...senderColors.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sender, color]) => {
      const firstName = sender.split(' ')[0] ?? sender
      return `
        <div class="legend-item">
          <div class="legend-dot" style="background-color: ${color};"></div>
          <span>${escapeJS(firstName)}'s suggestions</span>
        </div>
      `
    })
    .join('')

  return items
}

/**
 * Generate a list-only HTML page when no geocoded points are available.
 * Shows all activities in a nice list format with category emojis.
 */
function generateListOnlyHTML(suggestions: readonly GeocodedActivity[], config: MapConfig): string {
  const title = config.title ?? 'Things To Do'

  const listItems = suggestions
    .map((s) => {
      const emoji = CATEGORY_EMOJI[s.category] ?? '📍'
      const date = s.timestamp.toISOString().split('T')[0]
      const loc = formatLocation(s)
      const location = loc ? `<span class="location">${escapeJS(loc)}</span>` : ''
      return `
        <div class="item">
          <span class="emoji">${emoji}</span>
          <div class="content">
            <div class="activity">${escapeJS(s.activity)}</div>
            <div class="meta">${date} • ${escapeJS(s.sender)}${location ? ` • ${location}` : ''}</div>
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

/**
 * Export suggestions to an interactive HTML map.
 *
 * @param suggestions Geocoded suggestions to export
 * @param config Map configuration options
 * @returns HTML string containing self-contained map
 */
export function exportToMapHTML(
  suggestions: readonly GeocodedActivity[],
  config: MapConfig = {}
): string {
  const { points, senderColors } = toMapPoints(suggestions, config)

  if (points.length === 0) {
    // No geocoded points - show a useful list instead of empty page
    return generateListOnlyHTML(suggestions, config)
  }

  const center = {
    lat: config.centerLat ?? calculateCenter(points).lat,
    lng: config.centerLng ?? calculateCenter(points).lng
  }
  const zoom = config.zoom ?? DEFAULT_ZOOM
  const markersJS = generateMarkersJS(points)
  const legendHTML = generateLegendHTML(senderColors)

  return `<!DOCTYPE html>
<html>
<head>
  <title>${config.title ?? 'Things To Do Map'}</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css" />
  <style>
    * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; }
    .info-box {
      position: absolute;
      top: 10px;
      right: 10px;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      max-width: 250px;
    }
    .legend {
      position: absolute;
      bottom: 30px;
      left: 10px;
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .view-list-link { display:inline-block; margin-top:10px; color:#2563eb; cursor:pointer; font-weight:500; }
    .view-list-link:hover { text-decoration:underline; }
    .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:2000; justify-content:center; align-items:center; }
    .modal-overlay.open { display:flex; }
    .modal { background:#fff; border-radius:12px; width:90%; max-width:700px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 50px rgba(0,0,0,0.3); }
    .modal-header { padding:20px 24px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; gap:16px; }
    .modal-header h2 { margin:0; font-size:20px; font-weight:600; flex:1; }
    .sort-control { display:flex; align-items:center; gap:8px; font-size:14px; color:#6b7280; }
    .sort-control select { padding:6px 10px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; background:#fff; cursor:pointer; }
    .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#6b7280; padding:4px 8px; }
    .modal-close:hover { color:#111; }
    .modal-body { padding:16px 24px; overflow-y:auto; flex:1; }
    .activity-row { display:flex; gap:16px; padding:12px 0; border-bottom:1px solid #f3f4f6; }
    .activity-row:last-child { border-bottom:none; }
    .activity-thumb, .activity-thumb-placeholder { width:64px; height:64px; border-radius:8px; flex-shrink:0; }
    .activity-thumb { object-fit:cover; }
    .activity-thumb-placeholder { background:#f3f4f6; }
    .activity-content { flex:1; min-width:0; }
    .activity-title { font-weight:500; color:#111; margin-bottom:4px; }
    .activity-meta { font-size:13px; color:#6b7280; margin-bottom:6px; }
    .activity-location { color:#2563eb; }
    .activity-links { display:flex; gap:12px; font-size:13px; }
    .activity-links a { color:#2563eb; text-decoration:none; }
    .activity-links a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div id="map"></div>

  <div class="info-box">
    <h3 style="margin-top: 0;">${escapeJS(config.title ?? 'Things To Do')}</h3>
    <p><strong>${points.length}</strong> suggestions with locations</p>
    <p style="font-size: 12px; color: #666;">
      Click markers to see details.<br>
      Zoom in to see individual pins.
    </p>
    <a class="view-list-link" onclick="openModal()">View Activity List →</a>
  </div>

  <div class="legend">
    ${legendHTML}
  </div>

  <div class="modal-overlay" id="activityModal" onclick="closeModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h2>Activity List</h2>
        <div class="sort-control">
          <label for="sortSelect">Sort by:</label>
          <select id="sortSelect" onchange="sortActivities(this.value)">
            <option value="score">Most Interesting</option>
            <option value="oldest">Oldest</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" id="activityListBody"></div>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js"></script>
  <script>
    var map = L.map('map').setView([${center.lat}, ${center.lng}], ${zoom});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var markersLayer = ${
      config.clusterMarkers !== false
        ? `L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false
    })`
        : 'L.layerGroup()'
    };

    ${markersJS}

    map.addLayer(markersLayer);

    // Fit bounds to all markers
    if (markersLayer.getLayers().length > 0) {
      map.fitBounds(markersLayer.getBounds(), { padding: [50, 50] });
    }

    // Activity data for sorting
    var activities = ${JSON.stringify(
      points.map((p) => ({
        id: p.activityId,
        activity: p.activity,
        sender: p.sender.split(' ')[0] ?? p.sender,
        location: p.location,
        date: p.date,
        score: p.score,
        imagePath: p.imagePath,
        placeId: p.placeId,
        url: p.url
      }))
    )};

    function renderActivityList(sorted) {
      var html = sorted.map(function(a) {
        var mapsUrl = a.placeId ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.activity) + '&query_place_id=' + a.placeId : null;
        var thumb = a.imagePath ? '<img src="' + a.imagePath + '" class="activity-thumb" alt="" />' : '<div class="activity-thumb-placeholder"></div>';
        var links = (mapsUrl ? '<a href="' + mapsUrl + '" target="_blank">Google Maps</a>' : '') + (a.url ? '<a href="' + a.url + '" target="_blank">Source</a>' : '');
        return '<div class="activity-row">' + thumb + '<div class="activity-content"><div class="activity-title">' + a.activity + '</div><div class="activity-meta">' + (a.location ? '<span class="activity-location">' + a.location + '</span> · ' : '') + a.sender + ' · ' + a.date + '</div><div class="activity-links">' + links + '</div></div></div>';
      }).join('');
      document.getElementById('activityListBody').innerHTML = html;
    }

    function sortActivities(sortBy) {
      var sorted = activities.slice();
      if (sortBy === 'score') sorted.sort(function(a, b) { return b.score - a.score; });
      else if (sortBy === 'oldest') sorted.sort(function(a, b) { return a.date.localeCompare(b.date); });
      else if (sortBy === 'newest') sorted.sort(function(a, b) { return b.date.localeCompare(a.date); });
      renderActivityList(sorted);
    }

    // Modal functions
    function openModal() {
      document.getElementById('activityModal').classList.add('open');
      document.body.style.overflow = 'hidden';
      sortActivities(document.getElementById('sortSelect').value);
    }
    function closeModal(e) {
      if (!e || e.target === e.currentTarget) {
        document.getElementById('activityModal').classList.remove('open');
        document.body.style.overflow = '';
      }
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });
  </script>
</body>
</html>`
}
