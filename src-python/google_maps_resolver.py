"""
Google Maps URL Resolver

Resolves shortened Google Maps URLs (maps.app.goo.gl) to extract:
- Place name
- Coordinates (lat/lng)
- Place ID (for further API lookups)
"""

import os
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
REQUEST_DELAY = 0.2  # Be nice to APIs


def resolve_shortened_url(url: str) -> str | None:
    """Follow redirects to get the final Google Maps URL."""
    try:
        # Use a mobile user agent - Google Maps short URLs redirect differently
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        }
        resp = requests.get(url, headers=headers, allow_redirects=True, timeout=15)
        return resp.url
    except requests.RequestException as e:
        print(f"  Error resolving {url}: {e}")
        return None


def extract_coords_from_url(url: str) -> dict | None:
    """
    Extract coordinates from a Google Maps URL.

    Handles formats:
    - ?q=-36.878834,174.633606
    - @-36.8484,174.7622,15z
    - /place/.../@-36.8,174.7,15z
    - data=...!3d-36.8!4d174.7
    """
    # Direct coordinate query
    if "?q=" in url or "&q=" in url:
        parsed = urlparse(url)
        q = parse_qs(parsed.query).get("q", [None])[0]
        if q:
            match = re.match(r"(-?\d+\.?\d*),\s*(-?\d+\.?\d*)", q)
            if match:
                return {"lat": float(match.group(1)), "lng": float(match.group(2))}

    # @ format in path
    match = re.search(r"@(-?\d+\.?\d*),(-?\d+\.?\d*)", url)
    if match:
        return {"lat": float(match.group(1)), "lng": float(match.group(2))}

    # data= format with 3d/4d
    match = re.search(r"!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)", url)
    if match:
        return {"lat": float(match.group(1)), "lng": float(match.group(2))}

    return None


def extract_place_query_from_url(url: str) -> str | None:
    """Extract place name/query from Google Maps URL."""
    # /place/Place+Name/ format
    match = re.search(r"/place/([^/@]+)", url)
    if match:
        name = match.group(1)
        name = requests.utils.unquote(name)
        name = name.replace("+", " ")
        return name

    # ?q=Place+Name format (common in resolved URLs)
    if "?q=" in url or "&q=" in url:
        parsed = urlparse(url)
        q = parse_qs(parsed.query).get("q", [None])[0]
        if q:
            # Check if it's NOT just coordinates
            if not re.match(r"^-?\d+\.?\d*,\s*-?\d+\.?\d*$", q):
                q = requests.utils.unquote(q)
                q = q.replace("+", " ")
                return q

    return None


def geocode_place_name(place_name: str) -> dict | None:
    """Use Google Places API to geocode a place name."""
    url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    params = {
        "input": place_name,
        "inputtype": "textquery",
        "fields": "name,geometry,formatted_address",
        "locationbias": "circle:500000@-41.0,174.0",  # Bias to NZ
        "key": GOOGLE_API_KEY,
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") == "OK" and data.get("candidates"):
            candidate = data["candidates"][0]
            loc = candidate.get("geometry", {}).get("location", {})
            return {
                "lat": loc.get("lat"),
                "lng": loc.get("lng"),
                "name": candidate.get("name"),
                "address": candidate.get("formatted_address"),
            }
    except requests.RequestException as e:
        print(f"  Geocode error: {e}")

    return None


def get_place_details_from_coords(lat: float, lng: float) -> dict | None:
    """Use reverse geocoding to get place details from coordinates."""
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "latlng": f"{lat},{lng}",
        "key": GOOGLE_API_KEY,
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            return {
                "formatted_address": result.get("formatted_address"),
                "place_id": result.get("place_id"),
            }
    except requests.RequestException as e:
        print(f"  Reverse geocode error: {e}")

    return None


def process_google_maps_urls(conn: sqlite3.Connection) -> dict:
    """Process all Google Maps URLs in the database."""
    cursor = conn.execute("""
        SELECT id, message_id, url, resolved_url
        FROM urls
        WHERE url_type = 'google_maps'
    """)
    urls = list(cursor)

    stats = {"total": len(urls), "resolved": 0, "with_coords": 0, "with_name": 0}
    results = []

    print(f"Processing {len(urls)} Google Maps URLs...")

    for i, row in enumerate(urls):
        url_id = row["id"]
        message_id = row["message_id"]
        original_url = row["url"]
        current_resolved = row["resolved_url"]

        print(f"[{i+1}/{len(urls)}] {original_url[:60]}...")

        # Start with original or already-resolved URL
        url_to_process = current_resolved or original_url

        # If it's a shortened URL, resolve it
        if "goo.gl" in url_to_process or "maps.app" in url_to_process:
            resolved = resolve_shortened_url(url_to_process)
            if resolved and resolved != url_to_process:
                url_to_process = resolved
                stats["resolved"] += 1
                print(f"  -> Resolved to: {resolved[:80]}...")

        # Extract coordinates from URL
        coords = extract_coords_from_url(url_to_process)
        place_name = None

        if coords:
            stats["with_coords"] += 1
            print(f"  -> Coords from URL: ({coords['lat']:.6f}, {coords['lng']:.6f})")
            # Reverse geocode to get place name
            details = get_place_details_from_coords(coords["lat"], coords["lng"])
            if details:
                place_name = details.get("formatted_address", "")[:100]
                stats["with_name"] += 1
                print(f"  -> Reverse geocoded: {place_name}")
        else:
            # Try to extract place query and geocode it
            place_query = extract_place_query_from_url(url_to_process)
            if place_query:
                print(f"  -> Place query: {place_query[:60]}...")
                geocoded = geocode_place_name(place_query)
                if geocoded and geocoded.get("lat"):
                    coords = {"lat": geocoded["lat"], "lng": geocoded["lng"]}
                    place_name = geocoded.get("name") or geocoded.get("address")
                    stats["with_coords"] += 1
                    stats["with_name"] += 1
                    print(f"  -> Geocoded: {place_name} ({coords['lat']:.6f}, {coords['lng']:.6f})")

        results.append({
            "url_id": url_id,
            "message_id": message_id,
            "resolved_url": url_to_process,
            "lat": coords["lat"] if coords else None,
            "lng": coords["lng"] if coords else None,
            "place_name": place_name,
        })

        time.sleep(REQUEST_DELAY)

    # Update database
    print("\nUpdating database...")

    for r in results:
        # Update URLs table
        conn.execute("""
            UPDATE urls
            SET resolved_url = ?,
                title = COALESCE(?, title)
            WHERE id = ?
        """, (r["resolved_url"], r["place_name"], r["url_id"]))

        # Update suggestions table if coordinates found
        if r["lat"] and r["lng"]:
            conn.execute("""
                UPDATE suggestions
                SET latitude = ?,
                    longitude = ?,
                    location_text = COALESCE(?, location_text)
                WHERE message_id = ?
            """, (r["lat"], r["lng"], r["place_name"], r["message_id"]))

    conn.commit()

    return stats


def main():
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"

    if not db_path.exists():
        print("Database not found. Run parser.py first.")
        return

    if not GOOGLE_API_KEY:
        print("GOOGLE_MAPS_API_KEY not set in .env")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    stats = process_google_maps_urls(conn)

    print("\n" + "=" * 60)
    print("GOOGLE MAPS RESOLUTION SUMMARY")
    print("=" * 60)
    print(f"  Total URLs: {stats['total']}")
    print(f"  Shortened URLs resolved: {stats['resolved']}")
    print(f"  With coordinates: {stats['with_coords']}")
    print(f"  With place name: {stats['with_name']}")

    # Show results
    print("\n" + "=" * 60)
    print("RESOLVED LOCATIONS")
    print("=" * 60)

    cursor = conn.execute("""
        SELECT u.title, u.resolved_url, s.latitude, s.longitude, m.content
        FROM urls u
        LEFT JOIN suggestions s ON u.message_id = s.message_id
        LEFT JOIN messages m ON u.message_id = m.id
        WHERE u.url_type = 'google_maps'
          AND (u.title IS NOT NULL OR s.latitude IS NOT NULL)
        ORDER BY m.timestamp DESC
    """)

    for row in cursor:
        name = row["title"] or "Unknown"
        lat = row["latitude"]
        lng = row["longitude"]
        coords = f"({lat:.4f}, {lng:.4f})" if lat else "No coords"
        content = (row["content"] or "")[:50].replace("\n", " ")
        print(f"  {name[:40]}: {coords}")
        print(f"    Message: {content}...")
        print()

    conn.close()


if __name__ == "__main__":
    main()
