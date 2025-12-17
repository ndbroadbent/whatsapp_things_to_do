"""
Export Module

Generates:
1. CSV/Excel spreadsheet with all suggestions
2. Interactive HTML map with Leaflet.js
"""

import csv
import sqlite3
from pathlib import Path

import pandas as pd


def export_to_csv(conn: sqlite3.Connection, output_path: Path):
    """Export suggestions to CSV."""

    query = """
        SELECT
            s.id,
            date(m.timestamp) as date,
            time(m.timestamp) as time,
            m.sender,
            m.content as original_message,
            s.extracted_activity as activity,
            s.location_text as location,
            s.latitude,
            s.longitude,
            s.confidence,
            s.suggestion_type as source,
            u.url as source_url,
            u.url_type,
            u.title as url_title,
            CASE WHEN s.latitude IS NOT NULL
                THEN 'https://www.google.com/maps?q=' || s.latitude || ',' || s.longitude
                ELSE NULL
            END as google_maps_link,
            s.status
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        LEFT JOIN urls u ON m.id = u.message_id
        ORDER BY s.confidence DESC, m.timestamp DESC
    """

    df = pd.read_sql_query(query, conn)

    # Clean up
    df["original_message"] = df["original_message"].str.replace("\n", " ").str[:500]
    df["activity"] = df["activity"].fillna(df["original_message"].str[:100])

    # Export
    df.to_csv(output_path, index=False, quoting=csv.QUOTE_ALL)
    print(f"Exported {len(df)} suggestions to {output_path}")

    return df


def export_to_excel(conn: sqlite3.Connection, output_path: Path):
    """Export suggestions to Excel with formatting."""

    query = """
        SELECT
            s.id,
            date(m.timestamp) as date,
            m.sender,
            m.content as original_message,
            COALESCE(s.extracted_activity, substr(m.content, 1, 100)) as activity,
            s.location_text as location,
            s.latitude,
            s.longitude,
            ROUND(s.confidence, 2) as confidence,
            s.suggestion_type as source,
            u.url as source_url,
            CASE WHEN s.latitude IS NOT NULL
                THEN 'https://www.google.com/maps?q=' || s.latitude || ',' || s.longitude
                ELSE NULL
            END as google_maps_link,
            COALESCE(s.status, 'pending') as status
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        LEFT JOIN urls u ON m.id = u.message_id
        ORDER BY s.confidence DESC, m.timestamp DESC
    """

    df = pd.read_sql_query(query, conn)
    df["original_message"] = df["original_message"].str.replace("\n", " ").str[:300]

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Suggestions")

        # Auto-adjust column widths
        worksheet = writer.sheets["Suggestions"]
        for i, col in enumerate(df.columns):
            max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
            max_len = min(max_len, 50)  # Cap at 50
            worksheet.column_dimensions[chr(65 + i)].width = max_len

    print(f"Exported {len(df)} suggestions to {output_path}")

    return df


def generate_map_html(conn: sqlite3.Connection, output_path: Path):
    """Generate interactive HTML map with Leaflet.js."""

    cursor = conn.execute("""
        SELECT
            s.id,
            m.timestamp,
            m.sender,
            m.content,
            s.extracted_activity,
            s.location_text,
            s.latitude,
            s.longitude,
            s.confidence,
            u.url as source_url
        FROM suggestions s
        JOIN messages m ON s.message_id = m.id
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
        ORDER BY s.confidence DESC
    """)
    points = list(cursor)

    print(f"Generating map with {len(points)} geocoded points...")

    # Get unique senders and assign colors
    senders = list(set(p["sender"] for p in points))
    sender_colors = {}
    colors = ["blue", "red", "green", "purple", "orange", "darkred", "darkblue", "darkgreen"]
    for i, sender in enumerate(sorted(senders)):
        sender_colors[sender] = colors[i % len(colors)]

    # Build markers JavaScript
    markers_js = ""
    for p in points:
        date = p["timestamp"][:10]
        sender = p["sender"].split()[0]
        activity = (p["extracted_activity"] or p["content"][:100]).replace("'", "\\'").replace("\n", " ")
        location = (p["location_text"] or "").replace("'", "\\'")
        url = p["source_url"] or ""

        popup_content = f"""
            <div style="max-width: 300px;">
                <strong>{activity[:80]}</strong><br>
                <small>{date} - {sender}</small><br>
                {f'<em>{location}</em><br>' if location else ''}
                {f'<a href="{url}" target="_blank">Source Link</a>' if url else ''}
            </div>
        """.replace("\n", "").replace("'", "\\'")

        # Color by sender
        color = sender_colors.get(p["sender"], "blue")

        markers_js += f"""
        L.marker([{p['latitude']}, {p['longitude']}], {{
            icon: L.divIcon({{
                className: 'custom-marker',
                html: '<div style="background-color: {color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            }})
        }}).addTo(markersLayer).bindPopup('{popup_content}');
        """

    # Calculate center (average of all points, or NZ center)
    if points:
        avg_lat = sum(p["latitude"] for p in points) / len(points)
        avg_lng = sum(p["longitude"] for p in points) / len(points)
    else:
        avg_lat, avg_lng = -41.0, 174.0  # NZ center

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Things To Do - Map</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css" />
    <style>
        body {{ margin: 0; padding: 0; }}
        #map {{ width: 100%; height: 100vh; }}
        .info-box {{
            position: absolute;
            top: 10px;
            right: 10px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            max-width: 250px;
        }}
        .legend {{
            position: absolute;
            bottom: 30px;
            left: 10px;
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            margin: 5px 0;
        }}
        .legend-dot {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }}
    </style>
</head>
<body>
    <div id="map"></div>

    <div class="info-box">
        <h3 style="margin-top: 0;">Things To Do</h3>
        <p><strong>{len(points)}</strong> suggestions with locations</p>
        <p style="font-size: 12px; color: #666;">
            Click markers to see details.<br>
            Zoom in to see individual pins.
        </p>
    </div>

    <div class="legend">
        {"".join(f'''<div class="legend-item">
            <div class="legend-dot" style="background-color: {sender_colors[s]};"></div>
            <span>{s.split()[0]}'s suggestions</span>
        </div>''' for s in sorted(senders))}
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js"></script>
    <script>
        var map = L.map('map').setView([{avg_lat}, {avg_lng}], 6);

        L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
            attribution: '© OpenStreetMap contributors'
        }}).addTo(map);

        var markersLayer = L.markerClusterGroup({{
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false
        }});

        {markers_js}

        map.addLayer(markersLayer);

        // Fit bounds to all markers
        if (markersLayer.getLayers().length > 0) {{
            map.fitBounds(markersLayer.getBounds(), {{ padding: [50, 50] }});
        }}
    </script>
</body>
</html>
"""

    output_path.write_text(html)
    print(f"Map saved to {output_path}")


def main():
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "chat.db"
    output_dir = project_root / "output"

    output_dir.mkdir(exist_ok=True)

    if not db_path.exists():
        print("Database not found.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    print("=" * 60)
    print("EXPORTING DATA")
    print("=" * 60)

    # CSV export
    csv_path = output_dir / "suggestions.csv"
    export_to_csv(conn, csv_path)

    # Excel export
    excel_path = output_dir / "suggestions.xlsx"
    export_to_excel(conn, excel_path)

    # Map export
    map_path = output_dir / "map.html"
    generate_map_html(conn, map_path)

    print("\n" + "=" * 60)
    print("EXPORT COMPLETE")
    print("=" * 60)
    print(f"\nFiles created in {output_dir}/")
    print(f"  - suggestions.csv")
    print(f"  - suggestions.xlsx")
    print(f"  - map.html (open in browser)")

    conn.close()


if __name__ == "__main__":
    main()
