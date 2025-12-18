# ChatToMap

Extract "things to do" from chat exports and visualize them on an interactive map.

![npm](https://img.shields.io/npm/v/chat-to-map)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)
![Node](https://img.shields.io/badge/Node-18%2B-green)

## What It Does

This tool parses WhatsApp (iOS/Android) and iMessage exports to find activity suggestions like:
- "We should go to..."
- "Let's try..."
- "Wanna visit..."
- "This looks fun!"

It then:
1. **Extracts** suggestions using regex patterns and URL detection
2. **Classifies** them with AI (activity vs errand, mappable vs general)
3. **Geocodes** locations to map coordinates
4. **Exports** to CSV, Excel, JSON, PDF, and interactive HTML map

## Quick Start (npx)

**Zero installation required!** Run directly with npx:

```bash
# Free scan - see what patterns match (no API key needed)
npx chat-to-map scan "WhatsApp Chat.zip"

# AI preview - classify top candidates (~$0.01)
npx chat-to-map preview "WhatsApp Chat.zip"

# Full analysis (~$1-2 depending on chat size)
npx chat-to-map analyze "WhatsApp Chat.zip"
```

## Installation

For repeated use, install globally:

```bash
npm install -g chat-to-map
```

Or as a project dependency:

```bash
npm install chat-to-map
```

## Usage

### Commands

```bash
chat-to-map scan <input>      # Heuristic scan (free, no API key)
chat-to-map preview <input>   # AI preview of top candidates (~$0.01)
chat-to-map analyze <input>   # Full pipeline with all exports
chat-to-map list              # Show previously processed chats
```

### Options

```bash
-o, --output-dir <dir>      Output directory (default: ./chat-to-map/output)
-f, --format <formats>      Output formats: csv,excel,json,map,pdf (default: all)
-r, --region <code>         Region bias for geocoding (e.g., NZ, US, UK)
-n, --limit <num>           Max results for preview/scan (default: 10)
--min-confidence <0-1>      Minimum confidence threshold (default: 0.5)
--activities-only           Exclude errands (activity_score > 0.5)
--category <cat>            Filter by category
--skip-geocoding            Skip geocoding step
-q, --quiet                 Minimal output
-v, --verbose               Verbose output
```

### API Keys

Set via environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...     # Required for classification
export GOOGLE_MAPS_API_KEY=AIza...      # Required for geocoding
export OPENAI_API_KEY=sk-...            # Optional for embeddings
```

Or use OpenRouter as a fallback:
```bash
export OPENROUTER_API_KEY=sk-or-...
```

## Examples

```bash
# Quick scan to see pattern matches (free)
chat-to-map scan "WhatsApp Chat with Travel Group.zip"

# Preview top 5 candidates with AI classification
chat-to-map preview "WhatsApp Chat.zip" -n 5

# Full analysis with NZ region bias
chat-to-map analyze "WhatsApp Chat.zip" -r NZ

# Export only CSV and map formats
chat-to-map analyze chat.txt -f csv,map

# Filter to activities only (exclude errands)
chat-to-map analyze chat.zip --activities-only

# Custom output directory
chat-to-map analyze chat.zip -o ./my-results
```

## Output Formats

| Format | Description |
|--------|-------------|
| **CSV** | Spreadsheet-compatible, all fields |
| **Excel** | Formatted .xlsx with filters |
| **JSON** | Machine-readable with metadata |
| **Map** | Interactive Leaflet.js HTML |
| **PDF** | Printable report with summary |

## As a Library

Use the core functions in your own code:

```typescript
import {
  parseWhatsAppChat,
  extractCandidates,
  classifyMessages,
  geocodeSuggestions,
  exportToMapHTML
} from 'chat-to-map'

// Parse a chat export
const messages = parseWhatsAppChat(rawChatText)

// Extract candidates (zero API cost)
const { candidates } = extractCandidates(messages)

// Classify with AI
const result = await classifyMessages(candidates, {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
})

if (result.ok) {
  // Geocode locations
  const geocoded = await geocodeSuggestions(
    result.value.filter(s => s.isMappable),
    { apiKey: process.env.GOOGLE_MAPS_API_KEY, regionBias: 'NZ' }
  )

  // Generate map
  const html = exportToMapHTML(geocoded, { title: 'Our Activities' })
}
```

## How It Works

### 1. Parsing
Supports WhatsApp iOS/Android formats:
```
[10/11/24, 9:36 PM] Alice: We should try that new restaurant!
10/11/24, 21:36 - Bob: Let's go this weekend
```

### 2. Candidate Extraction
- **Regex patterns**: "we should", "let's go", "bucket list", etc.
- **URL detection**: Google Maps, TikTok, Instagram, Airbnb, etc.
- **Exclusions**: Work, medical, chores, past tense filtered out

### 3. AI Classification
Each candidate is classified with:
- `activityScore`: 0.0 (errand) → 1.0 (fun activity)
- `category`: restaurant, hike, trip, event, etc.
- `isMappable`: Has specific location vs general idea

### 4. Geocoding
- Extracts coordinates from Google Maps URLs
- Geocodes place names with region bias
- Deduplicates by location

## Cost Estimates

| Chat Size | Scan | Preview | Full Analysis |
|-----------|------|---------|---------------|
| 1k messages | Free | ~$0.01 | ~$0.20 |
| 10k messages | Free | ~$0.01 | ~$0.50 |
| 50k messages | Free | ~$0.01 | ~$2.00 |

Costs vary based on number of candidates found and API pricing.

## Export WhatsApp Chat

On your phone:
1. Open the WhatsApp chat
2. Tap ⋮ (menu) → More → Export chat
3. Choose "Without media"
4. Save the `.zip` file

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

AGPL-3.0 - See [LICENSE](LICENSE)

---

Part of the [ChatToMap](https://chattomap.com) project.
