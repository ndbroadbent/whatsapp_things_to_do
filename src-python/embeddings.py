"""
Embeddings & Semantic Search

Embeds all messages using OpenAI text-embedding-3-small and provides
semantic search to find activity-related messages.
"""

import json
import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent.parent / ".env")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 100  # OpenAI recommends batching


def init_embeddings_table(conn: sqlite3.Connection):
    """Create embeddings table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS embeddings (
            message_id INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id)
        )
    """)
    conn.commit()


def get_embedding(text: str) -> list[float]:
    """Get embedding for a single text."""
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Get embeddings for a batch of texts."""
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]


def embedding_to_blob(embedding: list[float]) -> bytes:
    """Convert embedding list to bytes for SQLite storage."""
    return json.dumps(embedding).encode("utf-8")


def blob_to_embedding(blob: bytes) -> list[float]:
    """Convert bytes back to embedding list."""
    return json.loads(blob.decode("utf-8"))


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Calculate cosine similarity between two embeddings."""
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)


def embed_all_messages(conn: sqlite3.Connection) -> dict:
    """Embed all messages that don't have embeddings yet."""
    init_embeddings_table(conn)

    # Get messages without embeddings
    cursor = conn.execute("""
        SELECT m.id, m.content
        FROM messages m
        LEFT JOIN embeddings e ON m.id = e.message_id
        WHERE e.message_id IS NULL
          AND m.content != ''
          AND m.content NOT LIKE '%omitted%'
        ORDER BY m.id
    """)
    messages = list(cursor)

    if not messages:
        print("All messages already have embeddings.")
        return {"embedded": 0, "total": 0}

    print(f"Embedding {len(messages)} messages...")

    # Process in batches
    total_embedded = 0
    for i in range(0, len(messages), BATCH_SIZE):
        batch = messages[i:i + BATCH_SIZE]
        msg_ids = [m["id"] for m in batch]
        texts = [m["content"][:8000] for m in batch]  # Truncate very long messages

        print(f"  Batch {i//BATCH_SIZE + 1}/{(len(messages) + BATCH_SIZE - 1)//BATCH_SIZE}: {len(batch)} messages...")

        try:
            embeddings = get_embeddings_batch(texts)

            for msg_id, embedding in zip(msg_ids, embeddings):
                conn.execute(
                    "INSERT INTO embeddings (message_id, embedding) VALUES (?, ?)",
                    (msg_id, embedding_to_blob(embedding))
                )

            conn.commit()
            total_embedded += len(batch)

        except Exception as e:
            print(f"  Error in batch: {e}")
            # Try one by one for failed batch
            for msg_id, text in zip(msg_ids, texts):
                try:
                    embedding = get_embedding(text)
                    conn.execute(
                        "INSERT INTO embeddings (message_id, embedding) VALUES (?, ?)",
                        (msg_id, embedding_to_blob(embedding))
                    )
                    conn.commit()
                    total_embedded += 1
                except Exception as e2:
                    print(f"    Failed to embed message {msg_id}: {e2}")

    return {"embedded": total_embedded, "total": len(messages)}


def semantic_search(
    conn: sqlite3.Connection,
    query: str,
    top_k: int = 100,
    min_similarity: float = 0.3
) -> list[dict]:
    """
    Search messages semantically using embeddings.

    Returns list of (message_id, content, sender, timestamp, similarity) dicts.
    """
    # Get query embedding
    query_embedding = get_embedding(query)

    # Get all embeddings (in-memory search for now - could use vector DB for scale)
    cursor = conn.execute("""
        SELECT e.message_id, e.embedding, m.content, m.sender, m.timestamp
        FROM embeddings e
        JOIN messages m ON e.message_id = m.id
    """)

    results = []
    for row in cursor:
        embedding = blob_to_embedding(row["embedding"])
        similarity = cosine_similarity(query_embedding, embedding)

        if similarity >= min_similarity:
            results.append({
                "message_id": row["message_id"],
                "content": row["content"],
                "sender": row["sender"],
                "timestamp": row["timestamp"],
                "similarity": similarity,
            })

    # Sort by similarity descending
    results.sort(key=lambda x: x["similarity"], reverse=True)

    return results[:top_k]


def find_activity_candidates(conn: sqlite3.Connection, top_k: int = 500) -> list[dict]:
    """
    Find messages that might be "things to do" suggestions using semantic search.

    Uses multiple queries to cast a wide net, then deduplicates.
    """
    queries = [
        # Direct suggestion phrases
        "we should go visit this place together",
        "let's try this activity sometime",
        "I want to go there with you",
        "this looks like a fun thing to do",
        "bucket list destination we should visit",

        # Activity types
        "hiking trail walk nature reserve",
        "restaurant cafe bar food dining",
        "beach swimming kayaking water activities",
        "concert show festival event tickets",
        "hotel airbnb accommodation travel trip",

        # NZ specific
        "Queenstown Rotorua Wellington adventure",
        "New Zealand places to visit explore",
    ]

    all_results = {}  # Dedupe by message_id

    print(f"Running {len(queries)} semantic searches...")

    for i, query in enumerate(queries):
        print(f"  [{i+1}/{len(queries)}] \"{query[:40]}...\"")
        results = semantic_search(conn, query, top_k=200, min_similarity=0.25)

        for r in results:
            msg_id = r["message_id"]
            # Keep highest similarity score
            if msg_id not in all_results or r["similarity"] > all_results[msg_id]["similarity"]:
                all_results[msg_id] = r

    # Sort by similarity
    candidates = sorted(all_results.values(), key=lambda x: x["similarity"], reverse=True)

    print(f"Found {len(candidates)} unique candidate messages")

    return candidates[:top_k]


def main():
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"

    if not db_path.exists():
        print("Database not found. Run parser.py first.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Embed all messages
    print("=" * 60)
    print("EMBEDDING MESSAGES")
    print("=" * 60)

    stats = embed_all_messages(conn)
    print(f"\nEmbedded {stats['embedded']} new messages")

    # Find activity candidates
    print("\n" + "=" * 60)
    print("FINDING ACTIVITY CANDIDATES")
    print("=" * 60)

    candidates = find_activity_candidates(conn, top_k=500)

    # Show top candidates
    print("\n" + "=" * 60)
    print("TOP 30 CANDIDATES")
    print("=" * 60)

    for i, c in enumerate(candidates[:30]):
        content = c["content"][:70].replace("\n", " ")
        print(f"[{c['similarity']:.3f}] {c['sender'].split()[0]}: {content}")

    # Save candidates to a new table for Claude processing
    print("\n" + "=" * 60)
    print("SAVING CANDIDATES")
    print("=" * 60)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS llm_candidates (
            message_id INTEGER PRIMARY KEY,
            similarity REAL,
            processed BOOLEAN DEFAULT FALSE,
            is_suggestion BOOLEAN,
            extracted_activity TEXT,
            extracted_location TEXT,
            FOREIGN KEY (message_id) REFERENCES messages(id)
        )
    """)

    # Clear and repopulate
    conn.execute("DELETE FROM llm_candidates")

    for c in candidates:
        conn.execute("""
            INSERT INTO llm_candidates (message_id, similarity)
            VALUES (?, ?)
        """, (c["message_id"], c["similarity"]))

    conn.commit()
    print(f"Saved {len(candidates)} candidates for LLM processing")

    conn.close()


if __name__ == "__main__":
    main()
