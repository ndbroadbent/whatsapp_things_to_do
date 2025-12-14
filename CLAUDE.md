# Claude Code Guidelines for WhatsApp Things To Do

## Critical: TODO.md is Your Memory

**UPDATE TODO.md AFTER EVERY TASK AND SUBTASK.**

This is non-negotiable. TODO.md serves as:
1. Your working memory across context compactions
2. The user's visibility into progress
3. A handoff document for future Claude instances

When you complete something:
1. Mark it done in TODO.md immediately
2. Add any new subtasks discovered
3. Note any blockers or decisions made

When you start something:
1. Mark it "in progress" in TODO.md
2. Add subtasks if the task is complex

## Project Context

This project extracts "things to do" suggestions from a WhatsApp chat export. It finds all the times people said "we should do X" to each other and geocodes locations (biased to New Zealand by default).

### Key Files
- `PRD.txt` - Source of truth for requirements and architecture
- `TODO.md` - Current progress and next steps
- `data/chat.db` - SQLite database with parsed messages
- `src/` - All Python scripts

### Database Schema
```sql
messages (id, timestamp, sender, content, raw_line, has_media, media_type)
urls (id, message_id, url, url_type, resolved_url, title, description)
suggestions (id, message_id, suggestion_type, confidence, extracted_activity,
             location_text, latitude, longitude, notes, status)
```

## Cost Optimization Rules

1. **Embeddings are cheap** - embed everything, search liberally
2. **Claude API is expensive** - only classify pre-filtered candidates
3. **Google Maps API** - batch requests where possible
4. Always estimate costs before running bulk operations

## Code Standards

### Python
- Use pathlib for file paths
- Use sqlite3 with row_factory for database access
- Load .env with python-dotenv
- Type hints for function signatures
- Docstrings for modules and complex functions

### Running Scripts
Always activate venv first:
```bash
source .venv/bin/activate && python src/script.py
```

### Testing
- Test API keys with `src/test_api_keys.py` before bulk operations
- Sample small batches before processing everything

## Common Patterns

### Database Access
```python
from pathlib import Path
import sqlite3

db_path = Path(__file__).parent.parent / "data" / "chat.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
```

### API Keys
```python
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

api_key = os.getenv("OPENAI_API_KEY")
```

## What NOT to Do

- Don't run all 15k messages through Claude API
- Don't check secrets into git
- Don't process without cost estimates
- Don't forget to update TODO.md (seriously)

## Debugging Tips

- Check `data/chat.db` with sqlite3 CLI for data issues
- URLs table has `url_type` for filtering
- Suggestions table has `confidence` for ranking
