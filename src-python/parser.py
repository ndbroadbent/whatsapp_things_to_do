"""
WhatsApp Chat Parser

Parses WhatsApp iOS export format into structured messages.
Format: [MM/DD/YY, H:MM:SS AM/PM] Sender: Message
"""

import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator


@dataclass
class Message:
    id: int
    timestamp: datetime
    sender: str
    content: str
    raw_line: str
    has_media: bool = False
    media_type: str | None = None
    media_filename: str | None = None
    urls: list[str] | None = None


# WhatsApp iOS export format
MESSAGE_PATTERN = re.compile(
    r"^\[(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\]\s*"
    r"([^:]+):\s*(.*)$"
)

# Media placeholders in WhatsApp exports
MEDIA_PATTERNS = {
    "image": re.compile(r"^‎?image omitted$", re.IGNORECASE),
    "video": re.compile(r"^‎?video omitted$", re.IGNORECASE),
    "audio": re.compile(r"^‎?audio omitted$", re.IGNORECASE),
    "gif": re.compile(r"^‎?GIF omitted$", re.IGNORECASE),
    "sticker": re.compile(r"^‎?sticker omitted$", re.IGNORECASE),
    "document": re.compile(r"^‎?document omitted$", re.IGNORECASE),
    "contact": re.compile(r"^‎?Contact card omitted$", re.IGNORECASE),
}

# System messages to skip
SYSTEM_PATTERNS = [
    re.compile(r"^‎?This message was deleted\.?$", re.IGNORECASE),
    re.compile(r"^‎?You deleted this message\.?$", re.IGNORECASE),
    re.compile(r"^‎?Messages and calls are end-to-end encrypted", re.IGNORECASE),
    re.compile(r"^‎?Missed (voice|video) call$", re.IGNORECASE),
]

# URL extraction
URL_PATTERN = re.compile(
    r"https?://[^\s<>\"')\]]+",
    re.IGNORECASE
)


def parse_timestamp(date_str: str, time_str: str) -> datetime:
    """Parse WhatsApp timestamp format."""
    # Handle both 2-digit and 4-digit years
    date_parts = date_str.split("/")
    if len(date_parts[2]) == 2:
        date_format = "%m/%d/%y"
    else:
        date_format = "%m/%d/%Y"

    full_str = f"{date_str} {time_str}"
    return datetime.strptime(full_str, f"{date_format} %I:%M:%S %p")


def detect_media_type(content: str) -> tuple[bool, str | None]:
    """Detect if message is a media placeholder."""
    content_stripped = content.strip()
    for media_type, pattern in MEDIA_PATTERNS.items():
        if pattern.match(content_stripped):
            return True, media_type
    return False, None


def is_system_message(content: str) -> bool:
    """Check if message is a system message to skip."""
    content_stripped = content.strip()
    return any(pattern.match(content_stripped) for pattern in SYSTEM_PATTERNS)


def extract_urls(content: str) -> list[str]:
    """Extract all URLs from message content."""
    urls = URL_PATTERN.findall(content)
    # Clean trailing punctuation
    cleaned = []
    for url in urls:
        url = url.rstrip(".,;:!?")
        if url:
            cleaned.append(url)
    return cleaned


def parse_chat_file(filepath: Path) -> Iterator[Message]:
    """
    Parse WhatsApp chat export file.

    Handles multi-line messages by detecting continuation lines
    (lines that don't match the message pattern).
    """
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    msg_id = 0
    current_msg: dict | None = None

    for line in lines:
        # Try to match a new message
        match = MESSAGE_PATTERN.match(line)

        if match:
            # Yield previous message if exists
            if current_msg:
                yield _finalize_message(current_msg, msg_id)
                msg_id += 1

            date_str, time_str, sender, content = match.groups()

            current_msg = {
                "timestamp": parse_timestamp(date_str, time_str),
                "sender": sender.strip(),
                "content": content,
                "raw_line": line.rstrip("\n"),
            }
        elif current_msg:
            # Continuation of previous message (multi-line)
            current_msg["content"] += "\n" + line.rstrip("\n")
            current_msg["raw_line"] += "\n" + line.rstrip("\n")

    # Yield final message
    if current_msg:
        yield _finalize_message(current_msg, msg_id)


def _finalize_message(msg_data: dict, msg_id: int) -> Message:
    """Create Message object with media detection and URL extraction."""
    content = msg_data["content"]

    # Skip system messages
    if is_system_message(content):
        has_media, media_type = False, None
    else:
        has_media, media_type = detect_media_type(content)

    urls = extract_urls(content)

    return Message(
        id=msg_id,
        timestamp=msg_data["timestamp"],
        sender=msg_data["sender"],
        content=content,
        raw_line=msg_data["raw_line"],
        has_media=has_media,
        media_type=media_type,
        urls=urls if urls else None,
    )


def init_database(db_path: Path) -> sqlite3.Connection:
    """Initialize SQLite database with schema."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            raw_line TEXT NOT NULL,
            has_media BOOLEAN DEFAULT FALSE,
            media_type TEXT,
            media_filename TEXT
        );

        CREATE TABLE IF NOT EXISTS urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            url_type TEXT,
            resolved_url TEXT,
            title TEXT,
            description TEXT,
            FOREIGN KEY (message_id) REFERENCES messages(id)
        );

        CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            suggestion_type TEXT NOT NULL,
            confidence REAL,
            extracted_activity TEXT,
            location_text TEXT,
            latitude REAL,
            longitude REAL,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (message_id) REFERENCES messages(id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
        CREATE INDEX IF NOT EXISTS idx_urls_message_id ON urls(message_id);
        CREATE INDEX IF NOT EXISTS idx_urls_url_type ON urls(url_type);
        CREATE INDEX IF NOT EXISTS idx_suggestions_message_id ON suggestions(message_id);
    """)

    conn.commit()
    return conn


def classify_url(url: str) -> str:
    """Classify URL by type."""
    url_lower = url.lower()

    if "tiktok.com" in url_lower or "vt.tiktok" in url_lower:
        return "tiktok"
    elif "youtube.com" in url_lower or "youtu.be" in url_lower or "music.youtube" in url_lower:
        return "youtube"
    elif "instagram.com" in url_lower:
        return "instagram"
    elif "maps.google" in url_lower or "goo.gl/maps" in url_lower or "maps.app.goo.gl" in url_lower:
        return "google_maps"
    elif "trademe.co.nz" in url_lower:
        return "trademe"
    elif "airbnb" in url_lower:
        return "airbnb"
    elif "booking.com" in url_lower:
        return "booking"
    elif "tripadvisor" in url_lower:
        return "tripadvisor"
    elif "eventfinda" in url_lower or "ticketmaster" in url_lower or "eventbrite" in url_lower:
        return "event"
    else:
        return "website"


def store_messages(conn: sqlite3.Connection, messages: Iterator[Message]) -> dict:
    """Store parsed messages in database."""
    stats = {
        "total": 0,
        "with_media": 0,
        "with_urls": 0,
        "urls_by_type": {},
    }

    for msg in messages:
        # Insert message
        conn.execute("""
            INSERT INTO messages (id, timestamp, sender, content, raw_line, has_media, media_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            msg.id,
            msg.timestamp.isoformat(),
            msg.sender,
            msg.content,
            msg.raw_line,
            msg.has_media,
            msg.media_type,
        ))

        stats["total"] += 1
        if msg.has_media:
            stats["with_media"] += 1

        # Insert URLs
        if msg.urls:
            stats["with_urls"] += 1
            for url in msg.urls:
                url_type = classify_url(url)
                conn.execute("""
                    INSERT INTO urls (message_id, url, url_type)
                    VALUES (?, ?, ?)
                """, (msg.id, url, url_type))

                stats["urls_by_type"][url_type] = stats["urls_by_type"].get(url_type, 0) + 1

    conn.commit()
    return stats


def main():
    """Parse chat and store in database."""
    project_root = Path(__file__).parent.parent
    chat_file = project_root / "data" / "_chat.txt"
    db_path = project_root / "data" / "chat.db"

    if not chat_file.exists():
        print(f"Chat file not found: {chat_file}")
        return

    # Remove existing database to start fresh
    if db_path.exists():
        db_path.unlink()

    print(f"Parsing: {chat_file}")
    conn = init_database(db_path)

    messages = parse_chat_file(chat_file)
    stats = store_messages(conn, messages)

    print(f"\nParsing complete!")
    print(f"  Total messages: {stats['total']:,}")
    print(f"  With media: {stats['with_media']:,}")
    print(f"  With URLs: {stats['with_urls']:,}")
    print(f"\nURLs by type:")
    for url_type, count in sorted(stats["urls_by_type"].items(), key=lambda x: -x[1]):
        print(f"  {url_type}: {count}")

    # Show sample messages
    print(f"\nSample messages with URLs:")
    cursor = conn.execute("""
        SELECT m.timestamp, m.sender, m.content, u.url, u.url_type
        FROM messages m
        JOIN urls u ON m.id = u.message_id
        WHERE u.url_type IN ('tiktok', 'youtube', 'google_maps', 'event')
        LIMIT 10
    """)
    for row in cursor:
        print(f"  [{row['timestamp'][:10]}] {row['sender']}: {row['content'][:60]}...")
        print(f"    -> {row['url_type']}: {row['url'][:80]}")

    conn.close()
    print(f"\nDatabase saved to: {db_path}")


if __name__ == "__main__":
    main()
