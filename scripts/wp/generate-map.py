#!/usr/bin/env python3
"""
Universal Bubbler Map Visualizer

Usage:
    python visualize-bubblers.py <input_file> [--output map.html]
    
    - input_file: JSON file following the Bubbler schema (output from format-to-bubbly.py scripts)
    - output: HTML map file (default: map.html in same directory as input)

Generates an interactive Folium map with markers for each bubbler.
Click markers to see details like name, description, and maintainer.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    import folium
    from folium import plugins
except ImportError:
    print("Error: folium is required. Install with: pip install folium")
    sys.exit(1)


def load_bubbler_data(input_path: Path) -> Dict[str, Any]:
    """Load Bubbler data from JSON file."""
    data = json.loads(input_path.read_text(encoding="utf-8"))
    
    # Support both direct array format and wrapper format with "data" key
    if isinstance(data, dict) and "data" in data:
        return data
    elif isinstance(data, list):
        return {"data": data, "stats": {"count": len(data)}}
    else:
        raise ValueError("Input must be a JSON array or object with 'data' key")


def get_center_coords(bubblers: List[Dict[str, Any]]) -> tuple[float, float]:
    """Calculate center point from all bubbler coordinates."""
    if not bubblers:
        return (0, 0)
    
    lats = [b.get("latitude", 0) for b in bubblers if b.get("latitude") is not None]
    lngs = [b.get("longitude", 0) for b in bubblers if b.get("longitude") is not None]
    
    if not lats or not lngs:
        return (0, 0)
    
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))


def format_popup(bubbler: Dict[str, Any]) -> str:
    """Format bubbler info as HTML popup."""
    name = bubbler.get("name", "Unnamed")
    description = bubbler.get("description", "")
    maintainer = bubbler.get("maintainer", "")
    region = bubbler.get("region", "")
    
    html_parts = [f"<b>{name}</b>"]
    
    if description:
        html_parts.append(f"<br/><small>{description}</small>")
    
    coords_line = f"{bubbler.get('latitude', '?'):.5f}, {bubbler.get('longitude', '?'):.5f}"
    html_parts.append(f"<br/><small>📍 {coords_line}</small>")
    
    if maintainer:
        html_parts.append(f"<br/><small>🔧 Maintainer: {maintainer}</small>")
    
    if region:
        html_parts.append(f"<br/><small>🗺️ {region}</small>")
    
    return "".join(html_parts)


def create_map(bubblers: List[Dict[str, Any]], source: str = "Unknown", tiles: str = "CartoDB positron") -> folium.Map:
    """Create Folium map with bubbler markers."""
    center = get_center_coords(bubblers)
    
    # Determine zoom level based on geographic spread
    if bubblers:
        lats = [b.get("latitude", 0) for b in bubblers if b.get("latitude") is not None]
        lngs = [b.get("longitude", 0) for b in bubblers if b.get("longitude") is not None]
        lat_range = max(lats) - min(lats) if lats else 1
        lng_range = max(lngs) - min(lngs) if lngs else 1
        max_range = max(lat_range, lng_range)
        
        if max_range < 0.01:
            zoom = 18
        elif max_range < 0.1:
            zoom = 15
        elif max_range < 1:
            zoom = 12
        elif max_range < 10:
            zoom = 9
        else:
            zoom = 6
    else:
        zoom = 12
    
    m = folium.Map(
        location=center,
        zoom_start=zoom,
        tiles=tiles
    )
    
    # Add markers
    for bubbler in bubblers:
        lat = bubbler.get("latitude")
        lng = bubbler.get("longitude")
        
        if lat is None or lng is None:
            continue
        
        popup_html = format_popup(bubbler)
        
        # Color based on verification status
        if bubbler.get("verified"):
            color = "blue"
            icon_char = "✓"
        elif bubbler.get("approved"):
            color = "green"
            icon_char = "✓"
        else:
            color = "gray"
            icon_char = "?"
        
        folium.Marker(
            location=[lat, lng],
            popup=folium.Popup(popup_html, max_width=300),
            tooltip=bubbler.get("name", "Bubbler"),
            icon=folium.Icon(color=color, icon="droplet", prefix="fa"),
        ).add_to(m)
    
    # Add a title/attribution
    title_html = f"""
    <div style="position: fixed; 
            top: 10px; left: 50px; width: 250px; height: auto; 
            background-color: white; border:2px solid grey; z-index:9999; 
            font-size:14px; padding: 10px; border-radius: 5px;">
        <b>Bubbler Map</b><br/>
        Source: {source}<br/>
        Total: {len(bubblers)} fountains<br/>
        <small style="color: #666;">
            🟢 Green: Approved<br/>
            🔵 Blue: Verified<br/>
            ⚫ Gray: Unverified
        </small>
    </div>
    """
    m.get_root().html.add_child(folium.Element(title_html))
    
    return m


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Visualize Bubbler data on an interactive map."
    )
    parser.add_argument(
        "input",
        help="JSON file with Bubbler schema data (output from format-to-bubbly.py)",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Output HTML file (default: map.html in same directory as input)",
    )
    parser.add_argument(
        "--tiles",
        default="CartoDB positron",
        help="Folium tileset (default: CartoDB positron). Options: 'CartoDB positron', 'CartoDB voyager', 'Stamen Toner', 'Stamen TonerLite', 'OpenStreetMap'",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output) if args.output else input_path.parent / "map.html"

    print(f"Loading data from {input_path}...")
    payload = load_bubbler_data(input_path)
    
    bubblers = payload.get("data", [])
    source = payload.get("source", "Unknown")
    
    if not bubblers:
        print("Error: No bubbler data found in input file.", file=sys.stderr)
        sys.exit(1)

    print(f"Creating map with {len(bubblers)} bubblers (Source: {source}, Tiles: {args.tiles})...")
    m = create_map(bubblers, source, tiles=args.tiles)
    
    m.save(str(output_path))
    print(f"Map saved to: {output_path}")
    print(f"Open in browser: {output_path.resolve()}")


if __name__ == "__main__":
    main()
