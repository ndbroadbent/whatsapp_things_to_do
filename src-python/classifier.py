"""
Claude-based Suggestion Classifier

Processes candidate messages to determine if they're "things to do" suggestions
and extracts activity and location information.
"""

import os
import sqlite3
import time
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Use Haiku for cost efficiency - it's great for classification
MODEL = "claude-3-haiku-20240307"

BATCH_SIZE = 20  # Process multiple messages in one API call
REQUEST_DELAY = 0.5  # Rate limiting


def get_context_messages(conn: sqlite3.Connection, msg_id: int, window: int = 2) -> list[dict]:
    """Get surrounding messages for context."""
    cursor = conn.execute("""
        SELECT id, sender, content, timestamp
        FROM messages
        WHERE id BETWEEN ? AND ?
        ORDER BY id
    """, (msg_id - window, msg_id + window))
    return [dict(row) for row in cursor]


def build_classification_prompt(messages_with_context: list[dict]) -> str:
    """Build the prompt for Claude to classify messages."""

    messages_text = ""
    for i, item in enumerate(messages_with_context):
        msg = item["message"]
        context = item["context"]

        # Format context
        context_lines = []
        for ctx in context:
            if ctx["id"] == msg["id"]:
                context_lines.append(f">>> {ctx['sender']}: {ctx['content']}")  # Highlight target
            else:
                context_lines.append(f"    {ctx['sender']}: {ctx['content']}")

        messages_text += f"""
---
MESSAGE #{i+1} (ID: {msg['id']})
Context:
{chr(10).join(context_lines)}
---
"""

    prompt = f"""You are analyzing WhatsApp messages between two people. Your task is to identify messages that suggest "things to do" - activities, places to visit, events to attend, trips to take, etc.

For each message marked with >>>, determine:
1. Is this a suggestion for something to do together? (yes/no)
2. If yes, what is the activity/thing to do?
3. If yes, what location is mentioned (if any)?

Focus on:
- Suggestions to visit places (restaurants, beaches, parks, cities)
- Activities to try (hiking, kayaking, concerts, shows)
- Travel plans (trips, hotels, Airbnb)
- Events to attend (festivals, markets, movies)
- Experiences to have ("we should try...", "let's go to...")

Ignore:
- Mundane tasks (groceries, cleaning, work)
- Past events (things they already did)
- Vague statements without actionable suggestions
- Just sharing links without suggesting to go/do something

{messages_text}

Respond in this exact JSON format (array of objects, one per message):
```json
[
  {{
    "message_id": <id>,
    "is_suggestion": true/false,
    "activity": "<what to do - null if not a suggestion>",
    "location": "<place/location mentioned - null if none or not a suggestion>",
    "confidence": <0.0-1.0 how confident you are>
  }},
  ...
]
```

Only include messages that ARE suggestions (is_suggestion: true). Skip the rest.
Be concise with activity descriptions (under 100 chars).
For location, extract specific place names if mentioned.
"""
    return prompt


def classify_batch(conn: sqlite3.Connection, message_ids: list[int]) -> list[dict]:
    """Classify a batch of messages using Claude."""

    # Get messages with context
    messages_with_context = []
    for msg_id in message_ids:
        cursor = conn.execute("""
            SELECT id, sender, content, timestamp
            FROM messages WHERE id = ?
        """, (msg_id,))
        msg = dict(cursor.fetchone())
        context = get_context_messages(conn, msg_id, window=2)
        messages_with_context.append({"message": msg, "context": context})

    prompt = build_classification_prompt(messages_with_context)

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parse JSON from response
        text = response.content[0].text

        # Extract JSON from response (might be wrapped in ```json```)
        import json
        import re

        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", text)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find JSON array directly
            json_match = re.search(r"\[[\s\S]*\]", text)
            if json_match:
                json_str = json_match.group(0)
            else:
                print(f"  Could not find JSON in response: {text[:200]}")
                return []

        results = json.loads(json_str)
        return results

    except Exception as e:
        print(f"  Error classifying batch: {e}")
        return []


def classify_all_candidates(conn: sqlite3.Connection) -> dict:
    """Classify all LLM candidates."""

    # Get unprocessed candidates
    cursor = conn.execute("""
        SELECT message_id, similarity
        FROM llm_candidates
        WHERE processed = FALSE
        ORDER BY similarity DESC
    """)
    candidates = list(cursor)

    if not candidates:
        print("No unprocessed candidates.")
        return {"processed": 0, "suggestions": 0}

    print(f"Classifying {len(candidates)} candidates...")

    total_processed = 0
    total_suggestions = 0

    for i in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[i:i + BATCH_SIZE]
        message_ids = [c["message_id"] for c in batch]

        print(f"  Batch {i//BATCH_SIZE + 1}/{(len(candidates) + BATCH_SIZE - 1)//BATCH_SIZE}...")

        results = classify_batch(conn, message_ids)

        # Update database
        for msg_id in message_ids:
            # Find result for this message
            result = next((r for r in results if r.get("message_id") == msg_id), None)

            if result and result.get("is_suggestion"):
                conn.execute("""
                    UPDATE llm_candidates
                    SET processed = TRUE,
                        is_suggestion = TRUE,
                        extracted_activity = ?,
                        extracted_location = ?
                    WHERE message_id = ?
                """, (
                    result.get("activity"),
                    result.get("location"),
                    msg_id
                ))
                total_suggestions += 1
            else:
                conn.execute("""
                    UPDATE llm_candidates
                    SET processed = TRUE,
                        is_suggestion = FALSE
                    WHERE message_id = ?
                """, (msg_id,))

            total_processed += 1

        conn.commit()
        time.sleep(REQUEST_DELAY)

    return {"processed": total_processed, "suggestions": total_suggestions}


def merge_suggestions(conn: sqlite3.Connection):
    """Merge LLM-identified suggestions into the main suggestions table."""

    cursor = conn.execute("""
        SELECT lc.message_id, lc.extracted_activity, lc.extracted_location, lc.similarity
        FROM llm_candidates lc
        WHERE lc.is_suggestion = TRUE
    """)
    llm_suggestions = list(cursor)

    print(f"Merging {len(llm_suggestions)} LLM suggestions into main table...")

    for s in llm_suggestions:
        # Check if already in suggestions table
        existing = conn.execute(
            "SELECT id FROM suggestions WHERE message_id = ?",
            (s["message_id"],)
        ).fetchone()

        if existing:
            # Update existing
            conn.execute("""
                UPDATE suggestions
                SET extracted_activity = COALESCE(extracted_activity, ?),
                    location_text = COALESCE(location_text, ?),
                    confidence = MAX(confidence, ?)
                WHERE message_id = ?
            """, (
                s["extracted_activity"],
                s["extracted_location"],
                s["similarity"],
                s["message_id"]
            ))
        else:
            # Insert new
            conn.execute("""
                INSERT INTO suggestions (message_id, suggestion_type, confidence, extracted_activity, location_text)
                VALUES (?, 'llm', ?, ?, ?)
            """, (
                s["message_id"],
                s["similarity"],
                s["extracted_activity"],
                s["extracted_location"]
            ))

    conn.commit()


def main():
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"

    if not db_path.exists():
        print("Database not found. Run parser.py first.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Classify candidates
    print("=" * 60)
    print("CLASSIFYING CANDIDATES WITH CLAUDE")
    print("=" * 60)

    stats = classify_all_candidates(conn)
    print(f"\nProcessed: {stats['processed']}, Found suggestions: {stats['suggestions']}")

    # Merge into main suggestions table
    print("\n" + "=" * 60)
    print("MERGING SUGGESTIONS")
    print("=" * 60)

    merge_suggestions(conn)

    # Show results
    print("\n" + "=" * 60)
    print("ALL SUGGESTIONS (sample)")
    print("=" * 60)

    cursor = conn.execute("""
        SELECT s.*, m.sender, m.content, m.timestamp
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        ORDER BY s.confidence DESC
        LIMIT 50
    """)

    for row in cursor:
        activity = row["extracted_activity"] or row["content"][:50]
        location = row["location_text"] or ""
        date = row["timestamp"][:10]
        sender = row["sender"].split()[0]

        print(f"[{row['confidence']:.2f}] {date} {sender}: {activity[:60]}")
        if location:
            print(f"        Location: {location}")

    # Count totals
    total = conn.execute("SELECT COUNT(*) FROM suggestions").fetchone()[0]
    with_location = conn.execute("SELECT COUNT(*) FROM suggestions WHERE location_text IS NOT NULL").fetchone()[0]
    with_coords = conn.execute("SELECT COUNT(*) FROM suggestions WHERE latitude IS NOT NULL").fetchone()[0]

    print(f"\nTotal suggestions: {total}")
    print(f"With location text: {with_location}")
    print(f"With coordinates: {with_coords}")

    conn.close()


if __name__ == "__main__":
    main()
