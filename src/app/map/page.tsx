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
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        const lat = typeof data.latitude === "number" ? data.latitude : parseFloat(data.latitude);
        const lng = typeof data.longitude === "number" ? data.longitude : parseFloat(data.longitude);
        return Number.isNaN(lat) || Number.isNaN(lng) ? DEFAULT_CENTER : [lng, lat];
    } catch {
        return DEFAULT_CENTER;
    }
}

function normalizeBoundingBoxRing(coordinates: BoundingBoxRecord["coordinates"]) {
    const polygonCoordinates: GeoJSON.Position[][] =
        Array.isArray(coordinates?.[0]?.[0])
            ? (coordinates as GeoJSON.Position[][])
            : [coordinates as GeoJSON.Position[]];

    const outerRing = polygonCoordinates[0] ?? [];
    const normalizedRing = outerRing
        .map((pos) => [Number(pos?.[0]), Number(pos?.[1])] as [number, number])
        .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

    if (normalizedRing.length < 4) return null;

    const first = normalizedRing[0];
    const last = normalizedRing[normalizedRing.length - 1];
    if (!first || !last) return null;

    if (first[0] !== last[0] || first[1] !== last[1]) {
        normalizedRing.push([first[0], first[1]]);
    }

    return normalizedRing;
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

    // ✅ Caching Refs: Stores data immediately to safely redraw layers on theme switch
    const boundingBoxesRef = useRef<BoundingBoxRecord[]>([]);
    const waypointGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
    const initializedLayersRef = useRef<Set<string>>(new Set()); // Tracks events to prevent duplicate popups

    const mapStyleUrl = resolvedTheme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const { center, zoom } = getMapStateFromSearchParams(searchParams);
        if (zoom !== null) setMapZoom(zoom);

        if (center) {
            setMapCenter(center);
            return;
        }

        getGeoIpCenter().then(setMapCenter);
    }, [searchParams]);

    const openPopup = useCallback((coordinates: [number, number], id: number) => {
        if (!map) return;

        const el = document.createElement("div");
        ReactDOM.createRoot(el).render(<WaypointPopup coordinates={coordinates} id={id} />);
        const popup = new Popup({ closeButton: false, offset: 14, maxWidth: "none" })
            .setLngLat(coordinates)
            .setDOMContent(el)
            .addTo(map);

        setActivePopup(popup);
        popup.on("close", () => setActivePopup(null));
    }, [map]);

    // ✅ Map coordinate sync effect
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

    // ✅ Data Fetching: Runs ONLY ONCE to grab data instead of running on every theme swap
    useEffect(() => {
        const fetchMapData = async () => {
            try {
                const [bbRes, wpRes] = await Promise.all([
                    fetch("/api/boundingboxes").catch(() => null),
                    fetch("/api/waypoints").catch(() => null),
                ]);

                console.info("[Map] API status", {
                    boundingboxes: bbRes?.status ?? "failed",
                    waypoints: wpRes?.status ?? "failed",
                });

                if (bbRes && bbRes.ok) {
                    const bbData = await bbRes.json();
                    boundingBoxesRef.current = bbData.boundingBoxes ?? [];
                }

                if (wpRes && wpRes.ok) {
                    const wpData = await wpRes.json();
                    const fetchedWaypoints: Waypoint[] = wpData.waypoints ?? [];
                    setWaypoints(fetchedWaypoints); // Update state for search bar

                    waypointGeojsonRef.current = {
                        type: "FeatureCollection",
                        features: fetchedWaypoints.map((wp) => ({
                            type: "Feature",
                            geometry: { type: "Point", coordinates: [wp.longitude, wp.latitude] },
                            properties: wp,
                        })),
                    };
                } else {
                    toast.error("Failed to load waypoints");
                }

                // If map is already loaded by the time fetch finishes, trigger draw
                if (map && map.isStyleLoaded()) {
                    drawCustomLayers();
                }
            } catch (err) {
                console.error("[Map] Error loading data", err);
                toast.error("Error loading map data");
            }
        };

        fetchMapData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]); // Runs when map instantiates

    // ✅ Layer Rendering logic entirely separated from data fetching
    const drawCustomLayers = useCallback(() => {
        if (!map || !map.isStyleLoaded()) return;

        // --- Render Bounding Boxes ---
        boundingBoxesRef.current.forEach((box) => {
            const normalizedRing = normalizeBoundingBoxRing(box.coordinates);
            if (!normalizedRing) return;

            const boxId = `bbox-${box.id}`;
            const geojson: GeoJSON.FeatureCollection = {
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [normalizedRing] }, properties: box }],
            };

            if (!map.getSource(boxId)) {
                map.addSource(boxId, { type: "geojson", data: geojson });
            }

            if (!map.getLayer(`${boxId}-fill`)) {
                map.addLayer({
                    id: `${boxId}-fill`,
                    type: "fill",
                    source: boxId,
                    paint: { "fill-color": box.color ?? "#ff8c00", "fill-opacity": 0.14 },
                });

                // Attach events once to prevent memory leaks and duplication bugs
                if (!initializedLayersRef.current.has(`${boxId}-fill`)) {
                    initializedLayersRef.current.add(`${boxId}-fill`);
                    let boxPopup: Popup | null = null;

                    map.on("mouseenter", `${boxId}-fill`, (e) => {
                        map.getCanvas().style.cursor = "pointer";
                        boxPopup = new Popup({ closeButton: false, closeOnClick: false, offset: [0, -8] })
                            .setLngLat(e.lngLat)
                            .setHTML(`<div style="background:var(--background);color:var(--foreground);border:1px solid var(--border);padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;max-width:180px">${box.name}${box.description ? `<div style="font-size:11px;font-weight:400;color:var(--muted-foreground);margin-top:2px">${box.description}</div>` : ""}</div>`)
                            .addTo(map);
                    });

                    map.on("mousemove", `${boxId}-fill`, (e) => boxPopup?.setLngLat(e.lngLat));
                    map.on("mouseleave", `${boxId}-fill`, () => {
                        map.getCanvas().style.cursor = "";
                        boxPopup?.remove();
                        boxPopup = null;
                    });
                }
            }

            if (!map.getLayer(`${boxId}-stroke`)) {
                map.addLayer({
                    id: `${boxId}-stroke`,
                    type: "line",
                    source: boxId,
                    paint: { "line-color": box.color ?? "#ff8c00", "line-width": 3, "line-opacity": 0.95, "line-dasharray": [2, 1.25] },
                });
            }
        });

        // --- Render Waypoints ---
        if (waypointGeojsonRef.current) {
            const waypointSource = map.getSource(WAYPOINTS_SOURCE_ID) as GeoJSONSource | undefined;
            if (waypointSource) {
                waypointSource.setData(waypointGeojsonRef.current);
            } else {
                map.addSource(WAYPOINTS_SOURCE_ID, { type: "geojson", data: waypointGeojsonRef.current, cluster: true, clusterMaxZoom: 14, clusterRadius: 50 });
            }

            const heatmapSource = map.getSource(WAYPOINTS_HEAT_SOURCE_ID) as GeoJSONSource | undefined;
            if (heatmapSource) {
                heatmapSource.setData(waypointGeojsonRef.current);
            } else {
                map.addSource(WAYPOINTS_HEAT_SOURCE_ID, { type: "geojson", data: waypointGeojsonRef.current });
            }

            if (!map.getLayer(WAYPOINTS_HEAT_LAYER_ID)) {
                map.addLayer({
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

            if (!map.getLayer(WAYPOINTS_CLUSTERS_LAYER_ID)) {
                map.addLayer({
                    id: WAYPOINTS_CLUSTERS_LAYER_ID,
                    type: "circle",
                    source: WAYPOINTS_SOURCE_ID,
                    filter: ["has", "point_count"],
                    paint: { "circle-color": "#2563eb", "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28], "circle-stroke-width": 3, "circle-stroke-color": "rgba(37,99,235,0.25)" },
                });
            }

            if (!map.getLayer(WAYPOINTS_UNCLUSTERED_LAYER_ID)) {
                map.addLayer({
                    id: WAYPOINTS_UNCLUSTERED_LAYER_ID,
                    type: "circle",
                    source: WAYPOINTS_SOURCE_ID,
                    filter: ["!", ["has", "point_count"]],
                    paint: { "circle-color": "#2563eb", "circle-radius": 6, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
                });

                // Attach Waypoint events only once
                if (!initializedLayersRef.current.has("waypoints-events")) {
                    initializedLayersRef.current.add("waypoints-events");

                    map.on("click", WAYPOINTS_CLUSTERS_LAYER_ID, (e) => {
                        const features = map.queryRenderedFeatures(e.point, { layers: [WAYPOINTS_CLUSTERS_LAYER_ID] });
                        const clusterSource = map.getSource(WAYPOINTS_SOURCE_ID) as GeoJSONSource;
                        if (!clusterSource || !features.length) return;

                        clusterSource.getClusterExpansionZoom(features[0]?.properties.cluster_id)
                            .then((zoom: number) => {
                                map.easeTo({
                                    center: (features[0]?.geometry as GeoJSON.Point).coordinates as [number, number],
                                    zoom, duration: 400,
                                });
                            }).catch(() => { });
                    });

                    map.on("click", WAYPOINTS_UNCLUSTERED_LAYER_ID, (e) => {
                        const features = map.queryRenderedFeatures(e.point, { layers: [WAYPOINTS_UNCLUSTERED_LAYER_ID] });
                        if (!features.length) return;
                        const coords = (features[0]?.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
                        while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
                            coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
                        }
                        const rawId = (features[0]?.properties as { id?: unknown })?.id;
                        const waypointId = typeof rawId === "number" ? rawId : Number(rawId);
                        if (!Number.isFinite(waypointId)) return;
                        openPopup(coords, waypointId);
                    });

                    map.on("mouseenter", WAYPOINTS_CLUSTERS_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
                    map.on("mouseleave", WAYPOINTS_CLUSTERS_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
                    map.on("mouseenter", WAYPOINTS_UNCLUSTERED_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
                    map.on("mouseleave", WAYPOINTS_UNCLUSTERED_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
                }
            }

            if (!map.getLayer(WAYPOINTS_CLUSTER_COUNT_LAYER_ID) && map.getStyle()?.glyphs) {
                map.addLayer({
                    id: WAYPOINTS_CLUSTER_COUNT_LAYER_ID,
                    type: "symbol",
                    source: WAYPOINTS_SOURCE_ID,
                    filter: ["has", "point_count"],
                    layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Arial Unicode MS Bold"], "text-size": 11 },
                    paint: { "text-color": "#ffffff" },
                });
            }
        }
    }, [map, openPopup]);

    // ✅ Style Event Listener
    useEffect(() => {
        if (!map) return;

        // Fired ONLY when a new theme is 100% applied and ready
        const handleStyleLoad = async () => {
            try {
                const [bbRes, wpRes] = await Promise.all([
                    fetch("/api/boundingboxes").catch(() => null),
                    fetch("/api/waypoints").catch(() => null),
                ]);

                console.info("[Map] style.load refetch status", {
                    boundingboxes: bbRes?.status ?? "failed",
                    waypoints: wpRes?.status ?? "failed",
                });

                if (bbRes && bbRes.ok) {
                    const bbData = await bbRes.json();
                    boundingBoxesRef.current = bbData.boundingBoxes ?? [];
                }

                if (wpRes && wpRes.ok) {
                    const wpData = await wpRes.json();
                    const fetchedWaypoints: Waypoint[] = wpData.waypoints ?? [];
                    setWaypoints(fetchedWaypoints);

                    waypointGeojsonRef.current = {
                        type: "FeatureCollection",
                        features: fetchedWaypoints.map((wp) => ({
                            type: "Feature",
                            geometry: { type: "Point", coordinates: [wp.longitude, wp.latitude] },
                            properties: wp,
                        })),
                    };
                }
            } catch (err) {
                console.error("[Map] style.load refetch failed", err);
            }

            drawCustomLayers();
        };

        map.on("style.load", handleStyleLoad);

        // Run immediately in case the style is already loaded on first mount
        if (map.isStyleLoaded()) {
            handleStyleLoad();
        }

        return () => { map.off("style.load", handleStyleLoad); };
    }, [map, drawCustomLayers]);


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
                onMapLoad={setMap}
            />

            <div className="absolute top-4 left-4 z-20">
                <SearchBar
                    waypoints={waypoints}
                    onSelect={w => {
                        if (!map) return;
                        if (!Number.isFinite(w.longitude) || !Number.isFinite(w.latitude) || !Number.isFinite(w.id)) return;
                        activePopup?.remove();
                        map.flyTo({ center: [w.longitude, w.latitude], zoom: 18, duration: 600 });
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