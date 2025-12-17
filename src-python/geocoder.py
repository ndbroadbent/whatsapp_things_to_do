"""
Text Geocoder

Geocodes location names mentioned in suggestion text using Google Maps API.
"""

import os
import re
import sqlite3
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
REQUEST_DELAY = 0.2

# NZ place patterns to look for
NZ_REGIONS = [
    "auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin",
    "queenstown", "rotorua", "napier", "nelson", "palmerston north", "new plymouth",
    "whangarei", "invercargill", "gisborne", "timaru", "blenheim", "taupo",
    "hastings", "wanaka", "picton", "kaikoura", "franz josef", "milford",
    "coromandel", "waiheke", "matakana", "piha", "raglan", "mount maunganui",
    "bay of islands", "paihia", "russell", "kerikeri", "hokianga",
    "tongariro", "ruapehu", "taranaki", "abel tasman", "marlborough",
    "fiordland", "otago", "southland", "waikato", "northland", "hawke's bay",
]

# Common NZ activity locations
NZ_ATTRACTIONS = [
    "hobbiton", "waitomo", "sky tower", "te papa", "milford sound",
    "mount cook", "tongariro crossing", "cathedral cove", "hot water beach",
    "wai-o-tapu", "redwoods", "luge", "zorb", "bungy", "jet boat",
]


def extract_potential_locations(text: str) -> list[str]:
    """Extract potential location names from text."""
    locations = []
    text_lower = text.lower()

    # Check for known NZ places
    for place in NZ_REGIONS + NZ_ATTRACTIONS:
        if place in text_lower:
            locations.append(place.title())

    # Also look for capitalized words that might be place names
    # Pattern: 2+ capitalized words together (e.g., "Mount Eden", "Bay of Islands")
    cap_pattern = re.compile(r"\b([A-Z][a-z]+(?:\s+(?:of|the|and|at|in|on)?\s*[A-Z][a-z]+)*)\b")
    for match in cap_pattern.findall(text):
        if len(match) > 3 and match not in ["The", "And", "But", "For"]:
            locations.append(match)

    return list(set(locations))


def geocode_location(location: str, bias_to_nz: bool = True) -> dict | None:
    """Geocode a location name using Google Geocoding API."""
    url = "https://maps.googleapis.com/maps/api/geocode/json"

    # Add NZ bias for ambiguous names
    address = location
    if bias_to_nz and "new zealand" not in location.lower():
        address = f"{location}, New Zealand"

    params = {
        "address": address,
        "key": GOOGLE_API_KEY,
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            loc = result["geometry"]["location"]

            # Check if it's actually in NZ (rough bounds)
            lat, lng = loc["lat"], loc["lng"]
            is_in_nz = -47.5 <= lat <= -34.0 and 166.0 <= lng <= 179.0

            if bias_to_nz and not is_in_nz:
                return None  # Skip non-NZ results

            return {
                "lat": lat,
                "lng": lng,
                "formatted_address": result.get("formatted_address"),
            }

    except requests.RequestException as e:
        print(f"  Geocode error for '{location}': {e}")

    return None


def geocode_suggestions(conn: sqlite3.Connection) -> dict:
    """Geocode suggestions that have location text but no coordinates."""

    cursor = conn.execute("""
        SELECT s.id, s.message_id, s.location_text, s.extracted_activity, m.content
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        WHERE s.latitude IS NULL
          AND (s.location_text IS NOT NULL OR s.extracted_activity IS NOT NULL)
    """)
    suggestions = list(cursor)

    print(f"Processing {len(suggestions)} suggestions for geocoding...")

    stats = {"processed": 0, "geocoded": 0}

    for s in suggestions:
        stats["processed"] += 1

        # Try location_text first, then extracted_activity, then content
        text_sources = [
            s["location_text"],
            s["extracted_activity"],
            s["content"],
        ]

        geocoded = False
        for text in text_sources:
            if not text:
                continue

            locations = extract_potential_locations(text)
            for loc in locations:
                result = geocode_location(loc)
                if result:
                    conn.execute("""
                        UPDATE suggestions
                        SET latitude = ?,
                            longitude = ?,
                            location_text = COALESCE(location_text, ?)
                        WHERE id = ?
                    """, (
                        result["lat"],
                        result["lng"],
                        result.get("formatted_address"),
                        s["id"]
                    ))
                    conn.commit()
                    stats["geocoded"] += 1
                    geocoded = True
                    print(f"  Geocoded: {loc} -> ({result['lat']:.4f}, {result['lng']:.4f})")
                    break

                time.sleep(REQUEST_DELAY)

            if geocoded:
                break

    return stats


def main():
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"

    if not db_path.exists():
        print("Database not found.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    print("=" * 60)
    print("GEOCODING SUGGESTIONS")
    print("=" * 60)

    stats = geocode_suggestions(conn)

    print(f"\nProcessed: {stats['processed']}")
    print(f"Geocoded: {stats['geocoded']}")

    # Summary
    cursor = conn.execute("""
        SELECT COUNT(*) as total,
               SUM(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) as with_coords
        FROM suggestions
    """)
    row = cursor.fetchone()
    print(f"\nTotal suggestions: {row['total']}")
    print(f"With coordinates: {row['with_coords']}")

    conn.close()


if __name__ == "__main__":
    main()
