#!/usr/bin/env python3
"""
Interactive Bubbler Dataset Selector

Usage:
    python select_bubblers_map.py <input_file> [--output selector-map.html]

Creates an interactive map where you can draw a rectangle to select bubblers,
then download the selected subset as a new JSON dataset.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    import folium
    from folium import plugins
except ImportError:
    print("Error: folium is required. Install with: pip install folium")
    sys.exit(1)


def load_bubbler_data(input_path: Path) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Load Bubbler data and wrapper metadata from JSON file."""
    raw = json.loads(input_path.read_text(encoding="utf-8"))

    if isinstance(raw, dict) and "data" in raw:
        payload = raw
        wrapper_template = {k: v for k, v in raw.items() if k != "data"}
        return payload, {"has_wrapper": True, "wrapper_template": wrapper_template}

    if isinstance(raw, list):
        payload = {"data": raw, "stats": {"count": len(raw)}}
        return payload, {"has_wrapper": False, "wrapper_template": {}}

    raise ValueError("Input must be a JSON array or object with 'data' key")


def get_center_coords(bubblers: List[Dict[str, Any]]) -> Tuple[float, float]:
    """Calculate center point from all bubbler coordinates."""
    valid = [
        b
        for b in bubblers
        if isinstance(b.get("latitude"), (int, float))
        and isinstance(b.get("longitude"), (int, float))
    ]

    if not valid:
        return (0.0, 0.0)

    lats = [b["latitude"] for b in valid]
    lngs = [b["longitude"] for b in valid]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))


def get_zoom(bubblers: List[Dict[str, Any]]) -> int:
    """Determine zoom level based on coordinate spread."""
    lats = [
        b.get("latitude")
        for b in bubblers
        if isinstance(b.get("latitude"), (int, float))
    ]
    lngs = [
        b.get("longitude")
        for b in bubblers
        if isinstance(b.get("longitude"), (int, float))
    ]

    if not lats or not lngs:
        return 3

    lat_range = max(lats) - min(lats)
    lng_range = max(lngs) - min(lngs)
    max_range = max(lat_range, lng_range)

    if max_range < 0.01:
        return 18
    if max_range < 0.1:
        return 15
    if max_range < 1:
        return 12
    if max_range < 10:
        return 9
    return 6


def sample_visual_points(
    bubblers: List[Dict[str, Any]], max_display_points: int
) -> List[Tuple[int, Dict[str, Any]]]:
    """Downsample points for map rendering while keeping full data for selection/export."""
    valid = [
      (idx, b)
      for idx, b in enumerate(bubblers)
      if isinstance(b.get("latitude"), (int, float))
      and isinstance(b.get("longitude"), (int, float))
    ]

    if len(valid) <= max_display_points:
        return valid

    step = max(1, len(valid) // max_display_points)
    sampled = valid[::step]
    return sampled[:max_display_points]


def create_selector_map(
    bubblers: List[Dict[str, Any]],
    source: str,
    metadata: Dict[str, Any],
    max_display_points: int,
    tiles: str,
) -> folium.Map:
    """Create Folium map with rectangle-based selector and JSON download."""
    center = get_center_coords(bubblers)
    zoom = get_zoom(bubblers)

    m = folium.Map(location=center, zoom_start=zoom, tiles=tiles, prefer_canvas=True)

    visual_points = sample_visual_points(bubblers, max_display_points)

    plugins.Draw(
        export=False,
        draw_options={
            "polyline": False,
            "polygon": False,
            "circle": False,
            "marker": False,
            "circlemarker": False,
            "rectangle": True,
        },
        edit_options={"edit": False, "remove": True},
    ).add_to(m)

    map_var = m.get_name()
    data_json = json.dumps(bubblers, separators=(",", ":"))
    preview_json = json.dumps(
      [
        {
          "idx": idx,
          "lat": point["latitude"],
          "lng": point["longitude"],
          "name": point.get("name") or "Bubbler",
        }
        for idx, point in visual_points
      ],
      separators=(",", ":"),
    )
    wrapper_template_json = json.dumps(
        metadata.get("wrapper_template", {}), separators=(",", ":")
    )
    source_json = json.dumps(source)
    has_wrapper_js = "true" if metadata.get("has_wrapper") else "false"

    panel_html = f"""
    <div id="selector-panel" style="position: fixed; top: 10px; left: 10px; z-index: 9999;
         background: white; border: 2px solid #94a3b8; border-radius: 8px; padding: 10px;
         width: 320px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15); font-family: sans-serif;">
      <div style="font-size: 15px; font-weight: bold; margin-bottom: 8px;">Bubbler Dataset Selector</div>
      <div style="font-size: 12px; margin-bottom: 4px;"><strong>Source:</strong> {source}</div>
      <div style="font-size: 12px; margin-bottom: 4px;"><strong>Total points:</strong> {len(bubblers)}</div>
      <div style="font-size: 12px; margin-bottom: 8px;"><strong>Preview points:</strong> {len(visual_points)}</div>
      <div style="font-size: 12px; color: #475569; margin-bottom: 8px;">
        Draw rectangle with map tools or hold Shift and drag to select in bulk.
      </div>
      <div id="selected-count" style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">Selected: 0</div>
      <input id="download-name" type="text" value="selected-bubblers.json"
             style="width: 100%; box-sizing: border-box; padding: 6px; margin-bottom: 8px; border: 1px solid #cbd5e1; border-radius: 4px;"/>
      <button id="download-selected" style="width: 100%; padding: 8px; border: none; border-radius: 4px;
              background: #0f766e; color: white; cursor: pointer; margin-bottom: 6px;">
        Download Selected JSON
      </button>
      <button id="clear-selection" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1;
              border-radius: 4px; background: #f8fafc; cursor: pointer;">
        Clear Selection
      </button>
      <div style="font-size: 11px; color: #64748b; margin-top: 8px;">
        Tip: Use rectangle remove/edit controls (top-right) to redraw quickly.
      </div>
    </div>
    """
    m.get_root().html.add_child(folium.Element(panel_html))

    selection_js = f"""
    <script>
      (function() {{
        var mapName = "{map_var}";
        var bubblerData = {data_json};
        var previewPoints = {preview_json};
        var hasWrapper = {has_wrapper_js};
        var wrapperTemplate = {wrapper_template_json};
        var source = {source_json};

        var selectedIndices = new Set();
        var previewMarkers = Object.create(null);

        function isValidCoord(v) {{
          return typeof v === "number" && Number.isFinite(v);
        }}

        function updateCount() {{
          var el = document.getElementById("selected-count");
          if (el) {{
            el.textContent = "Selected: " + selectedIndices.size;
          }}
        }}

        function markerStyle(isSelected) {{
          if (isSelected) {{
            return {{ radius: 6, weight: 2, color: "#991b1b", fillColor: "#ef4444", fillOpacity: 0.9 }};
          }}
          return {{ radius: 5, weight: 1, color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.7 }};
        }}

        function refreshPreviewStyles() {{
          Object.keys(previewMarkers).forEach(function(key) {{
            var idx = Number(key);
            var marker = previewMarkers[key];
            marker.setStyle(markerStyle(selectedIndices.has(idx)));
          }});
        }}

        function togglePoint(idx) {{
          if (selectedIndices.has(idx)) {{
            selectedIndices.delete(idx);
          }} else {{
            selectedIndices.add(idx);
          }}
          updateCount();
          refreshPreviewStyles();
        }}

        function selectByBounds(bounds, replaceSelection) {{
          if (replaceSelection) {{
            selectedIndices.clear();
          }}

          var south = bounds.getSouth();
          var west = bounds.getWest();
          var north = bounds.getNorth();
          var east = bounds.getEast();

          for (var i = 0; i < bubblerData.length; i += 1) {{
            var b = bubblerData[i];
            var lat = b.latitude;
            var lng = b.longitude;
            if (!isValidCoord(lat) || !isValidCoord(lng)) {{
              continue;
            }}
            if (lat >= south && lat <= north && lng >= west && lng <= east) {{
              selectedIndices.add(i);
            }}
          }}

          updateCount();
          refreshPreviewStyles();
        }}

        function downloadSelected() {{
          if (selectedIndices.size === 0) {{
            alert("No bubblers selected yet. Draw a rectangle first.");
            return;
          }}

          var selected = [];
          selectedIndices.forEach(function(idx) {{
            selected.push(bubblerData[idx]);
          }});

          var output;
          if (hasWrapper) {{
            output = Object.assign({{}}, wrapperTemplate);
            output.data = selected;
            output.stats = Object.assign({{}}, output.stats || {{}});
            output.stats.count = selected.length;
            output.stats.selectedAt = new Date().toISOString();
            if (!output.source) {{
              output.source = source;
            }}
          }} else {{
            output = selected;
          }}

          var text = JSON.stringify(output, null, 2);
          var blob = new Blob([text], {{ type: "application/json;charset=utf-8" }});
          var url = URL.createObjectURL(blob);

          var nameInput = document.getElementById("download-name");
          var fileName = (nameInput && nameInput.value.trim()) || "selected-bubblers.json";
          if (!fileName.toLowerCase().endsWith(".json")) {{
            fileName += ".json";
          }}

          var a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          URL.revokeObjectURL(url);
        }}

        function wireUpMap(map) {{
          map.on(L.Draw.Event.CREATED, function(event) {{
            var layer = event.layer;
            if (event.layerType === "rectangle") {{
              selectByBounds(layer.getBounds(), false);
            }}
            map.addLayer(layer);
          }});

          map.on("boxzoomend", function(event) {{
            if (event && event.boxZoomBounds) {{
              selectByBounds(event.boxZoomBounds, false);
            }}
          }});

          var previewLayer = L.layerGroup();
          previewLayer.addTo(map);
          previewPoints.forEach(function(point) {{
            var marker = L.circleMarker([point.lat, point.lng], markerStyle(false));
            marker.bindTooltip(point.name);
            marker.on("click", function() {{
              togglePoint(point.idx);
            }});
            marker.addTo(previewLayer);
            previewMarkers[String(point.idx)] = marker;
          }});
        }}

        function waitForMapInit(retriesLeft) {{
          var map = window[mapName];
          if (map) {{
            wireUpMap(map);
            return;
          }}
          if (retriesLeft <= 0) {{
            console.error("Map object not available for selector:", mapName);
            return;
          }}
          window.setTimeout(function() {{
            waitForMapInit(retriesLeft - 1);
          }}, 50);
        }}

        var clearButton = document.getElementById("clear-selection");
        if (clearButton) {{
          clearButton.addEventListener("click", function() {{
            selectedIndices.clear();
            updateCount();
            refreshPreviewStyles();
          }});
        }}

        var downloadButton = document.getElementById("download-selected");
        if (downloadButton) {{
          downloadButton.addEventListener("click", downloadSelected);
        }}

        updateCount();
        waitForMapInit(200);
      }})();
    </script>
    """

    m.get_root().html.add_child(folium.Element(selection_js))
    folium.LayerControl(position="topright").add_to(m)
    return m


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a map where you can rectangle-select bubblers and download a subset JSON."
    )
    parser.add_argument(
        "input",
        help="JSON file with Bubbler schema data (array or object with 'data').",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Output HTML file (default: selector-map.html in same directory as input).",
    )
    parser.add_argument(
        "--tiles",
        default="CartoDB positron",
        help="Folium tileset (default: CartoDB positron).",
    )
    parser.add_argument(
        "--max-display-points",
        type=int,
        default=12000,
        help="Max points rendered on map for performance (default: 12000).",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = (
        Path(args.output) if args.output else input_path.parent / "selector-map.html"
    )

    print(f"Loading data from {input_path}...")
    payload, metadata = load_bubbler_data(input_path)
    bubblers = payload.get("data", [])
    source = payload.get("source", "Unknown")

    if not bubblers:
        print("Error: No bubbler data found in input file.", file=sys.stderr)
        sys.exit(1)

    print(
        "Building selector map "
        f"(points={len(bubblers)}, max_display={args.max_display_points}, tiles={args.tiles})..."
    )
    m = create_selector_map(
        bubblers=bubblers,
        source=source,
        metadata=metadata,
        max_display_points=max(100, args.max_display_points),
        tiles=args.tiles,
    )

    m.save(str(output_path))
    print(f"Selector map saved to: {output_path}")
    print("Open the HTML file, draw a rectangle, then click 'Download Selected JSON'.")


if __name__ == "__main__":
    main()
