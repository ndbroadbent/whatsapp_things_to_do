"""
Suggestion Extractor

Uses regex patterns and LLM classification to identify "things to do" suggestions
from WhatsApp messages.
"""

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SuggestionPattern:
    name: str
    pattern: re.Pattern
    confidence: float
    description: str


# Patterns that strongly indicate a suggestion to do something
SUGGESTION_PATTERNS = [
    # Direct suggestions
    SuggestionPattern(
        "we_should",
        re.compile(r"\bwe should\b(?! not| stop| avoid)", re.IGNORECASE),
        0.9,
        "We should..."
    ),
    SuggestionPattern(
        "lets_go",
        re.compile(r"\blet'?s go\b(?! home| back| now)", re.IGNORECASE),
        0.85,
        "Let's go..."
    ),
    SuggestionPattern(
        "lets_try",
        re.compile(r"\blet'?s try\b", re.IGNORECASE),
        0.85,
        "Let's try..."
    ),
    SuggestionPattern(
        "wanna_go",
        re.compile(r"\bwanna go\b|\bwant to go\b", re.IGNORECASE),
        0.85,
        "Wanna/want to go..."
    ),
    SuggestionPattern(
        "should_we",
        re.compile(r"\bshould we\b(?! not| stop)", re.IGNORECASE),
        0.8,
        "Should we...?"
    ),
    SuggestionPattern(
        "we_could",
        re.compile(r"\bwe could\b(?! not| never)", re.IGNORECASE),
        0.7,
        "We could..."
    ),
    SuggestionPattern(
        "i_want_to",
        re.compile(r"\bi want to\b(?! die| cry| leave)", re.IGNORECASE),
        0.6,
        "I want to..."
    ),
    SuggestionPattern(
        "we_need_to",
        re.compile(r"\bwe need to\b(?! stop| avoid)", re.IGNORECASE),
        0.6,
        "We need to..."
    ),
    SuggestionPattern(
        "bucket_list",
        re.compile(r"\bbucket ?list\b", re.IGNORECASE),
        0.95,
        "Bucket list mention"
    ),
    SuggestionPattern(
        "must_visit",
        re.compile(r"\bmust visit\b|\bmust go\b|\bhave to visit\b", re.IGNORECASE),
        0.9,
        "Must visit/go..."
    ),
    SuggestionPattern(
        "would_be_fun",
        re.compile(r"\bwould be fun\b|\bwould be cool\b|\bwould be nice\b", re.IGNORECASE),
        0.75,
        "Would be fun/cool/nice..."
    ),
    SuggestionPattern(
        "one_day",
        re.compile(r"\bone day\b.*\b(go|visit|try|do|see)\b", re.IGNORECASE),
        0.7,
        "One day we should..."
    ),
    SuggestionPattern(
        "next_time",
        re.compile(r"\bnext time\b.*\b(go|visit|try|do|see|should)\b", re.IGNORECASE),
        0.7,
        "Next time..."
    ),
    SuggestionPattern(
        "lets_do",
        re.compile(r"\blet'?s do\b", re.IGNORECASE),
        0.8,
        "Let's do..."
    ),
    SuggestionPattern(
        "come_back",
        re.compile(r"\bcome back\b.*\b(and|to)\b", re.IGNORECASE),
        0.65,
        "Come back to..."
    ),
    SuggestionPattern(
        "looks_fun",
        re.compile(r"\blooks? (fun|amazing|awesome|incredible|beautiful)\b", re.IGNORECASE),
        0.5,
        "Looks fun/amazing..."
    ),
    SuggestionPattern(
        "can_we",
        re.compile(r"\bcan we\b.*\b(go|try|do|visit|see)\b", re.IGNORECASE),
        0.75,
        "Can we go/try/do...?"
    ),
]

# Activity/place keywords that boost confidence when combined with suggestions
ACTIVITY_KEYWORDS = [
    # Places
    r"\b(restaurant|cafe|coffee|bar|pub|brewery|winery|vineyard)\b",
    r"\b(beach|lake|river|waterfall|hot springs?|pool)\b",
    r"\b(hike|walk|trail|track|trek)\b",
    r"\b(mountain|hill|volcano|summit|peak)\b",
    r"\b(park|garden|reserve|sanctuary|forest)\b",
    r"\b(museum|gallery|exhibition|art)\b",
    r"\b(market|farmers market|night market)\b",
    r"\b(concert|show|theatre|movie|cinema|festival|event)\b",
    r"\b(hotel|airbnb|bach|accommodation|camping|glamping)\b",
    r"\b(kayak|paddleboard|surf|dive|snorkel|swim)\b",
    r"\b(ski|snowboard|bungy|skydive|zipline)\b",
    r"\b(tour|cruise|trip|getaway|holiday|vacation|road trip)\b",
    # NZ specific
    r"\b(rotorua|queenstown|wellington|taupo|coromandel|bay of islands)\b",
    r"\b(auckland|waiheke|matakana|piha|muriwai|raglan)\b",
    r"\b(hobbiton|milford|waitomo|tongariro)\b",
]

ACTIVITY_PATTERN = re.compile("|".join(ACTIVITY_KEYWORDS), re.IGNORECASE)

# Exclude patterns - things that look like suggestions but aren't activities
EXCLUDE_PATTERNS = [
    re.compile(r"\b(work|job|meeting|email|call|pay|bill|tax)\b", re.IGNORECASE),
    re.compile(r"\b(doctor|dentist|hospital|appointment)\b", re.IGNORECASE),
    re.compile(r"\b(groceries|shopping|buy|sell|order)\b", re.IGNORECASE),
    re.compile(r"\b(clean|laundry|dishes|vacuum)\b", re.IGNORECASE),
    re.compile(r"\b(should not|shouldn't|can't|cannot)\b", re.IGNORECASE),
]


def has_activity_keyword(content: str) -> bool:
    """Check if content contains activity-related keywords."""
    return bool(ACTIVITY_PATTERN.search(content))


def should_exclude(content: str) -> bool:
    """Check if content matches exclusion patterns."""
    return any(pattern.search(content) for pattern in EXCLUDE_PATTERNS)


def find_suggestions_regex(conn: sqlite3.Connection) -> list[dict]:
    """
    Find suggestions using regex patterns.
    Returns list of (message_id, pattern_name, confidence, content) tuples.
    """
    cursor = conn.execute("""
        SELECT id, sender, content, timestamp
        FROM messages
        WHERE content != ''
    """)

    suggestions = []

    for row in cursor:
        msg_id = row["id"]
        content = row["content"]
        sender = row["sender"]
        timestamp = row["timestamp"]

        # Skip excluded content
        if should_exclude(content):
            continue

        for pattern in SUGGESTION_PATTERNS:
            if pattern.pattern.search(content):
                confidence = pattern.confidence

                # Boost confidence if activity keywords present
                if has_activity_keyword(content):
                    confidence = min(1.0, confidence + 0.15)

                suggestions.append({
                    "message_id": msg_id,
                    "suggestion_type": f"regex:{pattern.name}",
                    "confidence": confidence,
                    "content": content,
                    "sender": sender,
                    "timestamp": timestamp,
                })
                break  # Only match first pattern per message

    return suggestions


def find_url_suggestions(conn: sqlite3.Connection) -> list[dict]:
    """
    Find suggestions that have activity-related URLs.
    Google Maps, TikToks about places, Airbnb links, etc.
    """
    cursor = conn.execute("""
        SELECT m.id, m.sender, m.content, m.timestamp, u.url, u.url_type
        FROM messages m
        JOIN urls u ON m.id = u.message_id
        WHERE u.url_type IN ('google_maps', 'airbnb', 'booking', 'tripadvisor', 'event')
           OR (u.url_type = 'tiktok' AND m.content != u.url)
           OR (u.url_type = 'youtube' AND m.content != u.url)
    """)

    suggestions = []

    for row in cursor:
        msg_id = row["id"]
        content = row["content"]
        url_type = row["url_type"]

        # Set confidence based on URL type
        confidence_map = {
            "google_maps": 0.7,
            "airbnb": 0.8,
            "booking": 0.8,
            "tripadvisor": 0.75,
            "event": 0.85,
            "tiktok": 0.5,
            "youtube": 0.4,
        }
        confidence = confidence_map.get(url_type, 0.5)

        # Boost if message text indicates suggestion
        content_lower = content.lower()
        if any(phrase in content_lower for phrase in [
            "let's go", "we should", "wanna go", "want to go", "should we",
            "check this out", "look at this", "this looks", "bucket list"
        ]):
            confidence = min(1.0, confidence + 0.25)

        # Boost for activity keywords
        if has_activity_keyword(content):
            confidence = min(1.0, confidence + 0.1)

        suggestions.append({
            "message_id": msg_id,
            "suggestion_type": f"url:{url_type}",
            "confidence": confidence,
            "content": content,
            "sender": row["sender"],
            "timestamp": row["timestamp"],
            "url": row["url"],
        })

    return suggestions


def get_context_messages(conn: sqlite3.Connection, msg_id: int, window: int = 3) -> list[dict]:
    """Get surrounding messages for context."""
    cursor = conn.execute("""
        SELECT id, sender, content, timestamp
        FROM messages
        WHERE id BETWEEN ? AND ?
        ORDER BY id
    """, (msg_id - window, msg_id + window))

    return [dict(row) for row in cursor]


def store_suggestions(conn: sqlite3.Connection, suggestions: list[dict]):
    """Store suggestions in database, avoiding duplicates."""
    # Clear existing suggestions
    conn.execute("DELETE FROM suggestions")

    # Deduplicate by message_id, keeping highest confidence
    by_message = {}
    for s in suggestions:
        msg_id = s["message_id"]
        if msg_id not in by_message or s["confidence"] > by_message[msg_id]["confidence"]:
            by_message[msg_id] = s

    for s in by_message.values():
        conn.execute("""
            INSERT INTO suggestions (message_id, suggestion_type, confidence, extracted_activity)
            VALUES (?, ?, ?, ?)
        """, (
            s["message_id"],
            s["suggestion_type"],
            s["confidence"],
            s["content"][:500],
        ))

    conn.commit()
    return len(by_message)


def main():
    """Run suggestion extraction."""
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"

    if not db_path.exists():
        print("Database not found. Run parser.py first.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    print("Finding suggestions with regex patterns...")
    regex_suggestions = find_suggestions_regex(conn)
    print(f"  Found {len(regex_suggestions)} regex matches")

    print("Finding suggestions from URLs...")
    url_suggestions = find_url_suggestions(conn)
    print(f"  Found {len(url_suggestions)} URL-based suggestions")

    all_suggestions = regex_suggestions + url_suggestions
    print(f"\nTotal suggestions before dedup: {len(all_suggestions)}")

    count = store_suggestions(conn, all_suggestions)
    print(f"Stored {count} unique suggestions")

    # Show top suggestions by confidence
    print("\n" + "="*80)
    print("TOP SUGGESTIONS (confidence >= 0.8)")
    print("="*80)

    cursor = conn.execute("""
        SELECT s.*, m.sender, m.content, m.timestamp
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        WHERE s.confidence >= 0.8
        ORDER BY s.confidence DESC, m.timestamp DESC
        LIMIT 30
    """)

    for row in cursor:
        date = row["timestamp"][:10]
        sender = row["sender"].split()[0]  # First name only
        content = row["content"][:80].replace("\n", " ")
        print(f"[{row['confidence']:.2f}] {date} {sender}: {content}")

    # Show by type breakdown
    print("\n" + "="*80)
    print("SUGGESTIONS BY TYPE")
    print("="*80)

    cursor = conn.execute("""
        SELECT suggestion_type, COUNT(*) as count, AVG(confidence) as avg_conf
        FROM suggestions
        GROUP BY suggestion_type
        ORDER BY count DESC
    """)

    for row in cursor:
        print(f"  {row['suggestion_type']}: {row['count']} (avg conf: {row['avg_conf']:.2f})")

    conn.close()


if __name__ == "__main__":
    main()
