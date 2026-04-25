"use client";

import { useEffect, useRef } from "react";
import { Map, NavigationControl } from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";

interface MapViewProps {
  styleURL?: string;
  center?: [number, number];
  zoom?: number;
  showControls?: boolean;
  className?: string;
  onMapLoad?: (map: Map) => void;
}

export default function MapBox({
  styleURL = "https://tiles.bubblymaps.org/styles/light/style.json",
  center = [153.03, -27.58],
  zoom = 10,
  showControls = true,
  className = "w-screen h-screen",
  onMapLoad,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const currentStyleUrl = useRef(styleURL);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new Map({
      container: mapContainer.current,
      style: styleURL,
      center,
      zoom,
      projection: undefined,
      forceNoAttributionControl: true,
      navigationControl: false,
      geolocateControl: false,
      scaleControl: false,
      fullscreenControl: false,
      terrainControl: false,
      projectionControl: false,
    });

    const rawMigrateProjection = (mapRef.current as any).migrateProjection?.bind(mapRef.current);
    if (rawMigrateProjection) {
      // Work around MapLibre crash when style.projection is missing during migration.
      (mapRef.current as any).migrateProjection = function patchedMigrateProjection(...args: unknown[]) {
        const ensureProjectionName = () => {
          const style = (this as any).style;
          if (!style) return;
          if (!style.projection) {
            const fallbackProjection = style.stylesheet?.projection?.type ?? "mercator";
            style.projection = { name: fallbackProjection };
          }
        };

        ensureProjectionName();
        try {
          return rawMigrateProjection(...args);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("reading 'name'")) {
            return;
          }
          if (message.includes("Style is not done loading")) {
            return;
          }
          throw error;
        }
      };
    }

    // Patch setTerrain: during style._load it calls setTerrain before the style is
    // ready, causing an internal "Style is not done loading" throw. Swallow it.
    const rawSetTerrain = (mapRef.current as any).setTerrain?.bind(mapRef.current);
    if (rawSetTerrain) {
      (mapRef.current as any).setTerrain = function patchedSetTerrain(...args: unknown[]) {
        try {
          return rawSetTerrain(...args);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("Style is not done loading")) return;
          throw error;
        }
      };
    }

    mapRef.current.forgetPersistedProjection();

    if (showControls) {
      mapRef.current.addControl(new NavigationControl(), "top-right");
    }

    if (onMapLoad) onMapLoad(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && styleURL && currentStyleUrl.current !== styleURL) {
      currentStyleUrl.current = styleURL;
      // Wait for map to be ready before changing style
      if (mapRef.current.isStyleLoaded()) {
        mapRef.current.setStyle(styleURL, { diff: false });
      } else {
        mapRef.current.once('load', () => {
          if (mapRef.current) {
            mapRef.current.setStyle(styleURL, { diff: false });
          }
        });
      }
    }
  }, [styleURL]);

  return <div ref={mapContainer} className={className} />;
}
