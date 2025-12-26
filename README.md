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
export PIXABAY_API_KEY=...            # Optional for images
```

### Images (Opt-In)

Images are **not fetched by default**. Use `--images` to enable:

```bash
chat-to-map analyze <input> --images
```

Or fetch images separately for existing results:

```bash
chat-to-map fetch-images <input>
```

**Tip:** To always fetch images, set it in your config:

```bash
chat-to-map config set fetchImages true
```

**Why opt-in?**
- Most external APIs don't allow automated scraping or rate-limit heavily
- Fetching can take a long time with thousands of activities
- Google Places photo lookups can be expensive
- The CLI works perfectly without images

**Where images are used:**
- Interactive map HTML (pin details on hover)
- Activity list view in map export
- Thumbnails in exported PDFs

### Configuration

Configuration is managed in `~/.config/chat-to-map/config.json`. `homeCountry` and `timezone` are auto-detected from your system and persisted for future runs. Other settings can be set via the `config` command.

**Available settings:**
- `homeCountry` - Your home country (auto-detected from IP if not set)
- `timezone` - Your timezone (auto-detected from system if not set)
- `fetchImages` - Whether to fetch images by default
- `cacheDir` - Custom cache directory
- `outputDir` - Default output directory
- `formats` - Default export formats

**Manage settings with the `config` command:**

```bash
# List all settings
chat-to-map config

# Set a value
chat-to-map config set homeCountry "New Zealand"
chat-to-map config set fetchImages true
chat-to-map config set formats csv,json,map

# Unset a value
chat-to-map config unset cacheDir
```

**Custom config file:**

```bash
# Use a different config file
chat-to-map analyze <input> --config-file /path/to/config.json

# Or via environment variable
export CHAT_TO_MAP_CONFIG=/path/to/config.json
```

## Library Usage

```typescript
import {
  parseWhatsAppChat,
  extractCandidatesByHeuristics,
  extractCandidates,  // combined: heuristics + embeddings
  classifyMessages,
  geocodeActivities,
  exportToMapHTML,
  quickScan
} from 'chat-to-map'

// Quick scan (zero API cost)
const scan = quickScan(chatText)
console.log(`Found ${scan.candidates.length} candidates`)

// Parse messages
const messages = parseWhatsAppChat(chatText)

// Extract candidates (heuristics only - sync, free)
const { candidates } = extractCandidatesByHeuristics(messages)

// Or with embeddings (async, requires OpenAI key)
// const result = await extractCandidates(messages, {
//   embeddings: { config: { apiKey: process.env.OPENAI_API_KEY } }
// })
// if (result.ok) candidates = result.value.candidates

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

## Privacy

**This library and CLI have zero telemetry.** We do not collect any data about your usage.

- No analytics or tracking
- No phone-home behavior
- No usage statistics
- Your chat data stays on your machine

The only network requests are to APIs you explicitly configure (Anthropic/OpenAI for classification, Google Maps for geocoding). These are direct calls to third-party services using your own API keys.

## License

AGPL-3.0 - See [LICENSE](LICENSE)

---

[ChatToMap.com](https://chattomap.com)
