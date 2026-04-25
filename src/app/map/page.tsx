"use client";

import "@maptiler/sdk/dist/maptiler-sdk.css";
import type { Map as MaptilerMap } from "@maptiler/sdk";
import { GeoJSONSource, Popup } from "@maptiler/sdk";
import ReactDOM from "react-dom/client";

import MapBox from "@/components/map/map";
import User from "@/components/user";
import WaypointPopup from "@/components/map/waypoint-popup";
import { ThemeToggle } from "@/components/map/controls/theme-toggle";
import { Credit } from "@/components/map/credit";
import { MapZoom } from "@/components/map/controls/map-zoom";
import { MapScale } from "@/components/map/controls/map-scale";
import { SearchBar } from "@/components/map/controls/search-bar";

import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";

import type { Waypoint } from "@/types/waypoints";

const MAP_STYLE_LIGHT = "https://api.maptiler.com/maps/openstreetmap/style.json?key=yk4XXl34ZfHSD7DbrZGh";
const MAP_STYLE_DARK = "https://api.maptiler.com/maps/openstreetmap-dark/style.json?key=yk4XXl34ZfHSD7DbrZGh";
const DEFAULT_CENTER: [number, number] = [151.21, -33.87];
const WAYPOINTS_SOURCE_ID = "bm-waypoints";
const WAYPOINTS_HEAT_SOURCE_ID = "bm-waypoints-heatmap";
const WAYPOINTS_HEAT_LAYER_ID = "bm-waypoints-heat";
const WAYPOINTS_CLUSTERS_LAYER_ID = "bm-waypoints-clusters";
const WAYPOINTS_CLUSTER_COUNT_LAYER_ID = "bm-waypoints-cluster-count";
const WAYPOINTS_UNCLUSTERED_LAYER_ID = "bm-waypoints-unclustered-point";

interface BoundingBoxRecord {
    id: number;
    name: string;
    description?: string | null;
    color?: string | null;
    coordinates: GeoJSON.Position[] | GeoJSON.Position[][];
}

function getMapStateFromSearchParams(searchParams: URLSearchParams) {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const zoom = searchParams.get("zoom");

    let center: [number, number] | null = null;
    let parsedZoom: number | null = null;

    if (lat && lng) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) center = [lngNum, latNum];
    }

    if (zoom) {
        const zoomNum = parseFloat(zoom);
        if (!Number.isNaN(zoomNum)) parsedZoom = zoomNum;
    }

    return { center, zoom: parsedZoom };
}

async function getGeoIpCenter(): Promise<[number, number]> {
    try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        const lat = typeof data.latitude === "number" ? data.latitude : parseFloat(data.latitude);
        const lng = typeof data.longitude === "number" ? data.longitude : parseFloat(data.longitude);
        return Number.isNaN(lat) || Number.isNaN(lng) ? DEFAULT_CENTER : [lng, lat];
    } catch {
        return DEFAULT_CENTER;
    }
}

function normalizeBoundingBoxRing(coordinates: BoundingBoxRecord["coordinates"]) {
    const rings: GeoJSON.Position[][] = Array.isArray(coordinates?.[0]?.[0])
        ? (coordinates as GeoJSON.Position[][])
        : [coordinates as GeoJSON.Position[]];

    const outer = rings[0] ?? [];
    const ring = outer
        .map((pos) => [Number(pos?.[0]), Number(pos?.[1])] as [number, number])
        .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

    if (ring.length < 4) return null;

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last) return null;

    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);

    return ring;
}

function MapPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const { resolvedTheme } = useTheme();

    const [mounted, setMounted] = useState(false);
    const [map, setMap] = useState<MaptilerMap | null>(null);
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    const [mapZoom, setMapZoom] = useState<number>(12);
    const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
    const [activePopup, setActivePopup] = useState<Popup | null>(null);

    // mapRef mirrors map state so async callbacks can access the latest instance
    const mapRef = useRef<MaptilerMap | null>(null);
    const boundingBoxesRef = useRef<BoundingBoxRecord[]>([]);
    const waypointGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
    const dataReadyRef = useRef(false);
    // Reset on every style.load so event listeners re-register on the new style's layers
    const registeredEventsRef = useRef<Set<string>>(new Set());
    const retryTimerRef = useRef<number | null>(null);

    const mapStyleUrl = resolvedTheme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const { center, zoom } = getMapStateFromSearchParams(searchParams);
        if (zoom !== null) setMapZoom(zoom);
        if (center) {
            setMapCenter(center);
        } else {
            getGeoIpCenter().then(setMapCenter);
        }
    }, [searchParams]);

    const handleMapLoad = useCallback((m: MaptilerMap) => {
        mapRef.current = m;
        setMap(m);
    }, []);

    const openPopup = useCallback((coordinates: [number, number], id: number) => {
        const m = mapRef.current;
        if (!m) return;
        const el = document.createElement("div");
        ReactDOM.createRoot(el).render(<WaypointPopup coordinates={coordinates} id={id} />);
        const popup = new Popup({ closeButton: false, offset: 14, maxWidth: "none" })
            .setLngLat(coordinates)
            .setDOMContent(el)
            .addTo(m);
        setActivePopup(popup);
        popup.on("close", () => setActivePopup(null));
    }, []);

    // Sync map position to URL
    useEffect(() => {
        if (!map) return;
        const onMove = () => {
            const { lat, lng } = map.getCenter();
            const params = new URLSearchParams(window.location.search);
            params.set("lat", lat.toFixed(5));
            params.set("lng", lng.toFixed(5));
            params.set("zoom", map.getZoom().toFixed(2));
            window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
        };
        map.on("moveend", onMove);
        return () => { map.off("moveend", onMove); };
    }, [map]);

    const drawLayers = useCallback(() => {
        const m = mapRef.current;
        if (!m) return;

        const retry = () => {
            if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = window.setTimeout(() => {
                retryTimerRef.current = null;
                drawLayers();
            }, 50);
        };

        if (!m.isStyleLoaded()) {
            retry();
            return;
        }

        try {
            // --- Bounding boxes ---
            for (const box of boundingBoxesRef.current) {
                const ring = normalizeBoundingBoxRing(box.coordinates);
                if (!ring) continue;

                const srcId = `bbox-${box.id}`;
                const geojson: GeoJSON.FeatureCollection = {
                    type: "FeatureCollection",
                    features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: box }],
                };

                if (m.getSource(srcId)) {
                    (m.getSource(srcId) as GeoJSONSource).setData(geojson);
                } else {
                    m.addSource(srcId, { type: "geojson", data: geojson });
                }

                if (!m.getLayer(`${srcId}-fill`)) {
                    m.addLayer({
                        id: `${srcId}-fill`,
                        type: "fill",
                        source: srcId,
                        paint: { "fill-color": box.color ?? "#ff8c00", "fill-opacity": 0.14 },
                    });
                }

                if (!m.getLayer(`${srcId}-stroke`)) {
                    m.addLayer({
                        id: `${srcId}-stroke`,
                        type: "line",
                        source: srcId,
                        paint: { "line-color": box.color ?? "#ff8c00", "line-width": 3, "line-opacity": 0.95, "line-dasharray": [2, 1.25] },
                    });
                }

                // Re-register on every style load (registeredEventsRef is cleared on style.load)
                if (!registeredEventsRef.current.has(srcId)) {
                    registeredEventsRef.current.add(srcId);
                    let hoverPopup: Popup | null = null;
                    m.on("mouseenter", `${srcId}-fill`, (e) => {
                        m.getCanvas().style.cursor = "pointer";
                        hoverPopup = new Popup({ closeButton: false, closeOnClick: false, offset: [0, -8] })
                            .setLngLat(e.lngLat)
                            .setHTML(
                                `<div style="background:var(--background);color:var(--foreground);border:1px solid var(--border);padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;max-width:180px">${box.name}${box.description ? `<div style="font-size:11px;font-weight:400;color:var(--muted-foreground);margin-top:2px">${box.description}</div>` : ""}</div>`,
                            )
                            .addTo(m);
                    });
                    m.on("mousemove", `${srcId}-fill`, (e) => hoverPopup?.setLngLat(e.lngLat));
                    m.on("mouseleave", `${srcId}-fill`, () => {
                        m.getCanvas().style.cursor = "";
                        hoverPopup?.remove();
                        hoverPopup = null;
                    });
                }
            }

            // --- Waypoints ---
            const geojson = waypointGeojsonRef.current;
            if (!geojson) return;

            const wpSrc = m.getSource(WAYPOINTS_SOURCE_ID) as GeoJSONSource | undefined;
            if (wpSrc) {
                wpSrc.setData(geojson);
            } else {
                m.addSource(WAYPOINTS_SOURCE_ID, {
                    type: "geojson",
                    data: geojson,
                    cluster: true,
                    clusterMaxZoom: 14,
                    clusterRadius: 50,
                });
            }

            const heatSrc = m.getSource(WAYPOINTS_HEAT_SOURCE_ID) as GeoJSONSource | undefined;
            if (heatSrc) {
                heatSrc.setData(geojson);
            } else {
                m.addSource(WAYPOINTS_HEAT_SOURCE_ID, { type: "geojson", data: geojson });
            }

            if (!m.getLayer(WAYPOINTS_HEAT_LAYER_ID)) {
                m.addLayer({
                    id: WAYPOINTS_HEAT_LAYER_ID,
                    type: "heatmap",
                    source: WAYPOINTS_HEAT_SOURCE_ID,
                    maxzoom: 13,
                    paint: {
                        "heatmap-weight": 1,
                        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 10, 0.7, 15, 1.5],
                        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 10, 40, 15, 60],
                        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(37,99,235,0)", 0.2, "rgba(37,99,235,0.2)", 0.5, "rgba(59,130,246,0.5)", 1, "rgba(147,197,253,0.9)"],
                        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 14, 0],
                    },
                });
            }

            if (!m.getLayer(WAYPOINTS_CLUSTERS_LAYER_ID)) {
                m.addLayer({
                    id: WAYPOINTS_CLUSTERS_LAYER_ID,
                    type: "circle",
                    source: WAYPOINTS_SOURCE_ID,
                    filter: ["has", "point_count"],
                    paint: {
                        "circle-color": "#2563eb",
                        "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28],
                        "circle-stroke-width": 3,
                        "circle-stroke-color": "rgba(37,99,235,0.25)",
                    },
                });
            }

            if (!m.getLayer(WAYPOINTS_UNCLUSTERED_LAYER_ID)) {
                m.addLayer({
                    id: WAYPOINTS_UNCLUSTERED_LAYER_ID,
                    type: "circle",
                    source: WAYPOINTS_SOURCE_ID,
                    filter: ["!", ["has", "point_count"]],
                    paint: { "circle-color": "#2563eb", "circle-radius": 6, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
                });
            }

            if (!m.getLayer(WAYPOINTS_CLUSTER_COUNT_LAYER_ID)) {
                try {
                    m.addLayer({
                        id: WAYPOINTS_CLUSTER_COUNT_LAYER_ID,
                        type: "symbol",
                        source: WAYPOINTS_SOURCE_ID,
                        filter: ["has", "point_count"],
                        layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Arial Unicode MS Bold"], "text-size": 11 },
                        paint: { "text-color": "#ffffff" },
                    });
                } catch {
                    // Glyphs may not be loaded yet; will succeed on next style.load
                }
            }

            // Register waypoint interaction events once per style load
            if (!registeredEventsRef.current.has("waypoints")) {
                registeredEventsRef.current.add("waypoints");

                m.on("click", WAYPOINTS_CLUSTERS_LAYER_ID, (e) => {
                    const features = m.queryRenderedFeatures(e.point, { layers: [WAYPOINTS_CLUSTERS_LAYER_ID] });
                    const src = m.getSource(WAYPOINTS_SOURCE_ID) as GeoJSONSource;
                    if (!src || !features[0]) return;
                    src.getClusterExpansionZoom(features[0].properties.cluster_id)
                        .then((zoom: number) => {
                            m.easeTo({ center: (features[0]?.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: 400 });
                        })
                        .catch(() => {});
                });

                m.on("click", WAYPOINTS_UNCLUSTERED_LAYER_ID, (e) => {
                    const features = m.queryRenderedFeatures(e.point, { layers: [WAYPOINTS_UNCLUSTERED_LAYER_ID] });
                    if (!features[0]) return;
                    const coords = (features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
                    while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
                        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
                    }
                    const rawId = (features[0].properties as { id?: unknown })?.id;
                    const id = typeof rawId === "number" ? rawId : Number(rawId);
                    if (!Number.isFinite(id)) return;
                    openPopup(coords, id);
                });

                m.on("mouseenter", WAYPOINTS_CLUSTERS_LAYER_ID, () => { m.getCanvas().style.cursor = "pointer"; });
                m.on("mouseleave", WAYPOINTS_CLUSTERS_LAYER_ID, () => { m.getCanvas().style.cursor = ""; });
                m.on("mouseenter", WAYPOINTS_UNCLUSTERED_LAYER_ID, () => { m.getCanvas().style.cursor = "pointer"; });
                m.on("mouseleave", WAYPOINTS_UNCLUSTERED_LAYER_ID, () => { m.getCanvas().style.cursor = ""; });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Style is not done loading")) {
                retry();
                return;
            }
            throw err;
        }
    }, [openPopup]);

    // Fetch data once on mount — never refetches on theme change
    useEffect(() => {
        const load = async () => {
            try {
                const [bbRes, wpRes] = await Promise.all([
                    fetch("/api/boundingboxes").catch(() => null),
                    fetch("/api/waypoints").catch(() => null),
                ]);

                if (bbRes?.ok) {
                    const { boundingBoxes } = await bbRes.json();
                    boundingBoxesRef.current = boundingBoxes ?? [];
                }

                if (wpRes?.ok) {
                    const { waypoints: wps } = await wpRes.json();
                    const list: Waypoint[] = wps ?? [];
                    setWaypoints(list);
                    waypointGeojsonRef.current = {
                        type: "FeatureCollection",
                        features: list.map((wp) => ({
                            type: "Feature",
                            geometry: { type: "Point", coordinates: [wp.longitude, wp.latitude] },
                            properties: wp,
                        })),
                    };
                } else if (wpRes) {
                    toast.error("Failed to load waypoints");
                }

                dataReadyRef.current = true;
                if (mapRef.current?.isStyleLoaded()) drawLayers();
            } catch {
                toast.error("Error loading map data");
            }
        };

        load();
    }, [drawLayers]);

    // Register style.load — redraws from cache on theme switch, no refetch
    useEffect(() => {
        if (!map) return;

        const onStyleLoad = () => {
            // Clear so event listeners re-attach to the freshly loaded style's layers
            registeredEventsRef.current = new Set();
            if (dataReadyRef.current) drawLayers();
        };

        const onStyleImageMissing = (e: { id?: string }) => {
            if (!e.id || map.hasImage(e.id) || e.id.trim().length > 0) return;
            map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
        };

        map.on("style.load", onStyleLoad);
        map.on("styleimagemissing", onStyleImageMissing);

        if (map.isStyleLoaded() && dataReadyRef.current) drawLayers();

        return () => {
            map.off("style.load", onStyleLoad);
            map.off("styleimagemissing", onStyleImageMissing);
            if (retryTimerRef.current) {
                window.clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };
    }, [map, drawLayers]);

    if (!mounted || !mapCenter) {
        return <div className="w-screen h-[100dvh] bg-muted" />;
    }

    return (
        <div className="w-screen h-[100dvh] relative overflow-hidden">
            <MapBox
                styleURL={mapStyleUrl}
                center={mapCenter}
                zoom={mapZoom}
                showControls={false}
                className="w-full h-full"
                onMapLoad={handleMapLoad}
            />

            <div className="absolute top-4 left-4 z-20">
                <SearchBar
                    waypoints={waypoints}
                    onSelect={(w) => {
                        const m = mapRef.current;
                        if (!m) return;
                        if (!Number.isFinite(w.longitude) || !Number.isFinite(w.latitude) || !Number.isFinite(w.id)) return;
                        activePopup?.remove();
                        m.flyTo({ center: [w.longitude, w.latitude], zoom: 18, duration: 600 });
                        setTimeout(() => openPopup([w.longitude, w.latitude], w.id), 650);
                    }}
                />
            </div>

            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {session ? (
                    <User />
                ) : (
                    <button
                        type="button"
                        onClick={() => router.push("/login")}
                        className="h-9 px-3.5 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-md text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                        Sign in
                    </button>
                )}
                <ThemeToggle />
            </div>

            <div className="absolute bottom-6 right-4 z-20 flex flex-col items-center gap-2">
                <MapZoom map={map} />
            </div>

            <div className="absolute bottom-6 left-4 z-10">
                <MapScale map={map} />
            </div>

            <Credit />
        </div>
    );
}

export default MapPage;
