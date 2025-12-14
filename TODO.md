# TODO - WhatsApp Things To Do

## Current Status
**Phase: COMPLETE - First Version Done! 🎉**

Last updated: 2024-12-14 (evening)

---

## Results Summary

| Metric | Count |
|--------|-------|
| Total messages parsed | 14,822 |
| Total URLs extracted | 362 |
| **Suggestions found** | **247** |
| With coordinates (on map) | 41 |
| With location text | ~140 |

### Geocoded Locations Include:
- Queenstown (multiple suggestions)
- Rotorua (lake house, place to visit)
- Bay of Islands (anniversary trip)
- Karangahake Gorge (hiking)
- Titirangi (hiking)
- Auckland, Kerikeri, Takapuna, Whangarei
- Various cafes and restaurants

---

## Completed ✅

### Setup
- [x] Project structure created
- [x] Virtual environment configured
- [x] Dependencies installed
- [x] API keys configured and tested
- [x] PRD.txt, CLAUDE.md, TODO.md created

### Data Pipeline
- [x] WhatsApp chat parser (`src/parser.py`) - 14,822 messages
- [x] URL extraction and classification - 362 URLs
- [x] Regex-based suggestion extractor (`src/suggestion_extractor.py`) - 238 suggestions
- [x] Google Maps URL resolution (`src/google_maps_resolver.py`) - 18/21 geocoded
- [x] OpenAI embeddings (`src/embeddings.py`) - 14,057 messages embedded
- [x] Claude classification (`src/classifier.py`) - 500 candidates processed
- [x] Text geocoding (`src/geocoder.py`) - NZ locations extracted

### Export
- [x] CSV export: `output/suggestions.csv`
- [x] Excel export: `output/suggestions.xlsx`
- [x] Interactive map: `output/map.html`

---

## Output Files

```
output/
├── suggestions.csv    # 247 rows, all columns
├── suggestions.xlsx   # Same data, formatted
└── map.html           # Interactive Leaflet.js map with 41 pins
```

### Spreadsheet Columns:
- id, date, time, sender
- original_message, activity, location
- latitude, longitude
- confidence, source, source_url
- url_type, url_title
- google_maps_link, status

---

## How to Use

### View the Map
```bash
open output/map.html
```

### Re-run Pipeline
```bash
source .venv/bin/activate

# Parse (only needed if chat export changes)
python src/parser.py

# Extract suggestions
python src/suggestion_extractor.py

# Resolve Google Maps URLs
python src/google_maps_resolver.py

# Generate embeddings (costs ~$0.02)
python src/embeddings.py

# Classify with Claude (costs ~$1-2)
python src/classifier.py

# Geocode locations
python src/geocoder.py

# Export
python src/export.py
```

---

## Known Issues / Limitations

1. **TikTok content**: Can't extract video descriptions due to API restrictions
2. **Some false positives**: "We should" catches non-activity suggestions (e.g., house buying advice)
3. **Geocoder over-matching**: Some common words incorrectly geocoded (cleaned up manually)
4. **WhatsApp deep links**: No way to link back to specific messages in app

---

## Future Improvements 💡

- [ ] Filter out non-activity "we should" (house buying, work, etc.)
- [ ] Process images with vision API to detect places
- [ ] Transcribe voice messages
- [ ] Better TikTok metadata extraction
- [ ] Google My Maps export
- [ ] "Mark as done" functionality
- [ ] Filter map by date range, sender, status

---

## Cost Tracking 💰

| Service | Estimated | Actual |
|---------|-----------|--------|
| OpenAI Embeddings | $0.02 | ~$0.02 |
| Google Places API | ~$0.50 | ~$0.10 |
| Google Geocoding | $5 | ~$0.50 |
| Claude API (Haiku) | $2-5 | ~$0.50 |
| **Total** | **~$10** | **~$1.12** |

Much cheaper than expected! Haiku is very cost-effective.
