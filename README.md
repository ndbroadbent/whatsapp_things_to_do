# ChatToMap

Transform chat exports into geocoded activity suggestions.

[![npm](https://img.shields.io/npm/v/chat-to-map)](https://www.npmjs.com/package/chat-to-map)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)

## Overview

ChatToMap extracts "things to do" from WhatsApp and iMessage exports - restaurants to try, places to visit, trips to take. It finds suggestions buried in years of chat history and puts them on a map.

**Features:**
- Parse WhatsApp (iOS/Android) and iMessage exports
- Extract suggestions using regex patterns and URL detection
- Classify with AI (activity vs errand, mappable vs general)
- Scrape metadata from TikTok and YouTube links
- Geocode locations to coordinates
- Export to CSV, Excel, JSON, PDF, and interactive HTML map

## Installation

```bash
# Run directly with npx (zero install)
npx chat-to-map scan "WhatsApp Chat.zip"

# Or install globally
npm install -g chat-to-map

# Or as a library
npm install chat-to-map
```

## CLI Usage

```bash
# Free scan - find patterns without API calls
chat-to-map scan <input>

# AI preview - classify top candidates (~$0.01)
chat-to-map preview <input>

# Full analysis with exports
chat-to-map analyze <input>

# List previously processed chats
chat-to-map list
```

### Options

```
-o, --output-dir <dir>    Output directory (default: ./chat-to-map/output)
-f, --format <formats>    Output formats: csv,excel,json,map,pdf
-r, --region <code>       Region bias for geocoding (e.g., NZ, US, UK)
-n, --limit <num>         Max results for preview/scan
--min-confidence <0-1>    Minimum confidence threshold
--activities-only         Exclude errands (activity_score > 0.5)
--category <cat>          Filter by category
--skip-geocoding          Skip geocoding step
-q, --quiet               Minimal output
-v, --verbose             Verbose output
```

### API Keys

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Required for classification
export GOOGLE_MAPS_API_KEY=AIza...    # Required for geocoding
export OPENAI_API_KEY=sk-...          # Optional for embeddings
```

## Library Usage

```typescript
import {
  parseWhatsAppChat,
  extractCandidates,
  classifyMessages,
  geocodeSuggestions,
  exportToMapHTML,
  quickScan
} from 'chat-to-map'

// Quick scan (zero API cost)
const scan = quickScan(chatText)
console.log(`Found ${scan.candidates.length} candidates`)

// Parse messages
const messages = parseWhatsAppChat(chatText)

// Extract candidates
const { candidates } = extractCandidates(messages)

// Classify with AI
const result = await classifyMessages(candidates, {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
})

// Geocode and export
if (result.ok) {
  const geocoded = await geocodeSuggestions(
    result.value.filter(s => s.isMappable),
    { apiKey: process.env.GOOGLE_MAPS_API_KEY }
  )
  const html = exportToMapHTML(geocoded)
}
```

### Social Media Scraping

Extract metadata from TikTok and YouTube links found in chats:

```typescript
import { scrapeUrl, scrapeTikTok, scrapeYouTube } from 'chat-to-map'

// Auto-detect platform
const result = await scrapeUrl('https://youtu.be/abc123')

// Or use platform-specific scrapers
const tiktok = await scrapeTikTok('https://vt.tiktok.com/xxx/')
const youtube = await scrapeYouTube('https://youtube.com/watch?v=xxx')

if (result.ok) {
  console.log(result.metadata.title)
  console.log(result.metadata.description)
  console.log(result.metadata.hashtags)
}
```

## Modules

| Module | Purpose |
|--------|---------|
| `parser` | Parse WhatsApp/iMessage exports |
| `extractor` | Find candidates via regex and URLs |
| `classifier` | AI classification (Claude/OpenAI) |
| `embeddings` | Semantic search with embeddings |
| `geocoder` | Convert locations to coordinates |
| `scraper` | Extract metadata from social URLs |
| `export` | CSV, Excel, JSON, PDF, HTML map |
| `scanner` | Zero-cost heuristic scanning |
| `cache` | API response caching |

## Export Formats

| Format | Description |
|--------|-------------|
| CSV | All fields, spreadsheet-compatible |
| Excel | Formatted .xlsx with filters |
| JSON | Machine-readable with full metadata |
| Map | Interactive Leaflet.js HTML |
| PDF | Printable report with summary |

## How to Export WhatsApp

1. Open WhatsApp chat
2. Tap ⋮ → More → Export chat
3. Choose "Without media"
4. Save the .zip file

## License

AGPL-3.0 - See [LICENSE](LICENSE)

---

[ChatToMap.com](https://chattomap.com)
