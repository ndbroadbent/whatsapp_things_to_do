"""
URL Resolver

Resolves shortened URLs and extracts metadata from various platforms.
- Google Maps: Extract coordinates and place name
- TikTok: Get video title/description (limited due to API restrictions)
- YouTube: Get video title
- Other websites: Extract page title and meta description
"""

import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests

# Be respectful with rate limiting
REQUEST_DELAY = 0.5  # seconds between requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def extract_google_maps_coords(url: str) -> dict | None:
    """
    Extract coordinates and place info from Google Maps URLs.

    Handles formats like:
    - https://maps.google.com/?q=-36.878834,174.633606
    - https://maps.app.goo.gl/xxxxx (needs redirect resolution)
    - https://www.google.com/maps/place/.../@-36.8,174.6,15z
    """
    # Direct coordinate format
    if "?q=" in url:
        parsed = urlparse(url)
        q = parse_qs(parsed.query).get("q", [None])[0]
        if q:
            # Try to parse as coordinates
            coord_match = re.match(r"(-?\d+\.?\d*),\s*(-?\d+\.?\d*)", q)
            if coord_match:
                return {
                    "latitude": float(coord_match.group(1)),
                    "longitude": float(coord_match.group(2)),
                    "place_name": None,
                }

    # Place URL format with coordinates in path
    coord_match = re.search(r"@(-?\d+\.?\d*),(-?\d+\.?\d*)", url)
    if coord_match:
        # Also try to extract place name
        place_match = re.search(r"/place/([^/@]+)", url)
        place_name = place_match.group(1).replace("+", " ") if place_match else None

        return {
            "latitude": float(coord_match.group(1)),
            "longitude": float(coord_match.group(2)),
            "place_name": place_name,
        }

    return None


def resolve_short_url(url: str) -> str | None:
    """Resolve shortened URLs (goo.gl, bit.ly, etc) to their target."""
    try:
        # Use HEAD request with redirect following disabled
        resp = requests.head(
            url,
            headers=HEADERS,
            allow_redirects=False,
            timeout=10
        )
        if resp.status_code in (301, 302, 303, 307, 308):
            return resp.headers.get("Location")

        # Some services need a GET request
        resp = requests.get(
            url,
            headers=HEADERS,
            allow_redirects=True,
            timeout=10
        )
        return resp.url

    except requests.RequestException as e:
        print(f"  Error resolving {url}: {e}")
        return None


def extract_page_metadata(url: str) -> dict | None:
    """Extract title and description from a web page."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        html = resp.text

        # Extract title
        title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else None

        # Extract meta description
        desc_match = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            re.IGNORECASE
        )
        if not desc_match:
            desc_match = re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
                html,
                re.IGNORECASE
            )

        description = desc_match.group(1).strip() if desc_match else None

        # Also try og:title and og:description
        if not title:
            og_title = re.search(
                r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
                html,
                re.IGNORECASE
            )
            title = og_title.group(1).strip() if og_title else None

        if not description:
            og_desc = re.search(
                r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
                html,
                re.IGNORECASE
            )
            description = og_desc.group(1).strip() if og_desc else None

        return {"title": title, "description": description}

    except requests.RequestException as e:
        print(f"  Error fetching {url}: {e}")
        return None


def process_google_maps_url(url: str) -> dict:
    """Process a Google Maps URL to extract location data."""
    result = {"resolved_url": url, "latitude": None, "longitude": None, "title": None}

    # First try to extract coords from original URL
    coords = extract_google_maps_coords(url)
    if coords:
        result.update(coords)
        result["title"] = coords.get("place_name")
        return result

    # If shortened URL, resolve it
    if "goo.gl" in url or "maps.app" in url:
        resolved = resolve_short_url(url)
        if resolved:
            result["resolved_url"] = resolved
            coords = extract_google_maps_coords(resolved)
            if coords:
                result.update(coords)
                result["title"] = coords.get("place_name")

    return result


def process_tiktok_url(url: str) -> dict:
    """
    Process TikTok URL.
    Note: TikTok heavily restricts scraping, so we mainly resolve the URL
    and try to extract any available metadata.
    """
    result = {"resolved_url": url, "title": None, "description": None}

    # Resolve shortened URLs
    if "vt.tiktok" in url:
        resolved = resolve_short_url(url)
        if resolved:
            result["resolved_url"] = resolved

    # Try to get page metadata (often blocked)
    target_url = result["resolved_url"]
    metadata = extract_page_metadata(target_url)
    if metadata:
        result["title"] = metadata.get("title")
        result["description"] = metadata.get("description")

    return result


def process_youtube_url(url: str) -> dict:
    """Process YouTube URL to extract video title."""
    result = {"resolved_url": url, "title": None, "description": None}

    # Resolve youtu.be short URLs
    if "youtu.be" in url:
        resolved = resolve_short_url(url)
        if resolved:
            result["resolved_url"] = resolved

    # Try to get video title
    metadata = extract_page_metadata(result["resolved_url"])
    if metadata:
        title = metadata.get("title", "")
        # Clean up YouTube title suffix
        title = re.sub(r"\s*-\s*YouTube$", "", title)
        result["title"] = title
        result["description"] = metadata.get("description")

    return result


def process_generic_url(url: str) -> dict:
    """Process generic website URL."""
    result = {"resolved_url": url, "title": None, "description": None}

    metadata = extract_page_metadata(url)
    if metadata:
        result["title"] = metadata.get("title")
        result["description"] = metadata.get("description")

    return result


def update_url_in_db(conn: sqlite3.Connection, url_id: int, data: dict):
    """Update URL record with resolved data."""
    conn.execute("""
        UPDATE urls
        SET resolved_url = ?,
            title = ?,
            description = ?
        WHERE id = ?
    """, (
        data.get("resolved_url"),
        data.get("title"),
        data.get("description"),
        url_id,
    ))


def update_suggestion_coords(conn: sqlite3.Connection, message_id: int, lat: float, lng: float, location_text: str = None):
    """Update suggestion with geocoded coordinates."""
    conn.execute("""
        UPDATE suggestions
        SET latitude = ?,
            longitude = ?,
            location_text = COALESCE(location_text, ?)
        WHERE message_id = ?
    """, (lat, lng, location_text, message_id))


def main():
    """Resolve URLs and extract metadata."""
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"

    if not db_path.exists():
        print("Database not found. Run parser.py first.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Get URLs that need processing
    cursor = conn.execute("""
        SELECT u.id, u.message_id, u.url, u.url_type
        FROM urls u
        WHERE u.resolved_url IS NULL
        ORDER BY u.url_type, u.id
    """)
    urls = list(cursor)

    print(f"Processing {len(urls)} URLs...")

    google_maps_coords = []

    for i, row in enumerate(urls):
        url_id = row["id"]
        message_id = row["message_id"]
        url = row["url"]
        url_type = row["url_type"]

        print(f"[{i+1}/{len(urls)}] {url_type}: {url[:60]}...")

        if url_type == "google_maps":
            data = process_google_maps_url(url)
            if data.get("latitude") and data.get("longitude"):
                google_maps_coords.append({
                    "message_id": message_id,
                    "lat": data["latitude"],
                    "lng": data["longitude"],
                    "place": data.get("title"),
                })
        elif url_type == "tiktok":
            data = process_tiktok_url(url)
        elif url_type == "youtube":
            data = process_youtube_url(url)
        else:
            data = process_generic_url(url)

        update_url_in_db(conn, url_id, data)

        if data.get("title"):
            print(f"  -> {data['title'][:60]}")

        time.sleep(REQUEST_DELAY)

    # Update suggestions with Google Maps coordinates
    print(f"\nUpdating {len(google_maps_coords)} suggestions with coordinates...")
    for coord in google_maps_coords:
        update_suggestion_coords(
            conn,
            coord["message_id"],
            coord["lat"],
            coord["lng"],
            coord.get("place")
        )

    conn.commit()

    # Show results summary
    print("\n" + "="*80)
    print("URL RESOLUTION SUMMARY")
    print("="*80)

    cursor = conn.execute("""
        SELECT url_type,
               COUNT(*) as total,
               SUM(CASE WHEN title IS NOT NULL THEN 1 ELSE 0 END) as with_title,
               SUM(CASE WHEN resolved_url != url THEN 1 ELSE 0 END) as resolved
        FROM urls
        GROUP BY url_type
        ORDER BY total DESC
    """)

    for row in cursor:
        print(f"  {row['url_type']}: {row['total']} total, {row['with_title']} with title, {row['resolved']} resolved")

    print("\n" + "="*80)
    print("SUGGESTIONS WITH COORDINATES")
    print("="*80)

    cursor = conn.execute("""
        SELECT s.*, m.content
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        WHERE s.latitude IS NOT NULL
        ORDER BY s.confidence DESC
    """)

    for row in cursor:
        content = row["content"][:60].replace("\n", " ")
        print(f"  ({row['latitude']:.4f}, {row['longitude']:.4f}) {content}")

    conn.close()


if __name__ == "__main__":
    main()
