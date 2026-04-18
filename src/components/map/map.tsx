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
      forceNoAttributionControl: true,
      navigationControl: false,
      geolocateControl: false,
      scaleControl: false,
      fullscreenControl: false,
      terrainControl: false,
      projectionControl: false,
    });

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
        mapRef.current.setStyle(styleURL);
      } else {
        mapRef.current.once('load', () => {
          if (mapRef.current) {
            mapRef.current.setStyle(styleURL);
          }
        });
      }
    }
  }, [styleURL]);

  return <div ref={mapContainer} className={className} />;
}
