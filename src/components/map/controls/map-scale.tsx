"use client";

import { useEffect, useState } from "react";
import type { Map as MaptilerMap } from "@maptiler/sdk";

function getScale(map: MaptilerMap | null): { label: string; pixels: number } {
    if (!map) return { label: "", pixels: 0 };
    const center = map.getCenter();
    const zoom = map.getZoom();
    const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
    const targetMeters = metersPerPixel * 80;
    let bestStep = steps[0]!;
    for (const s of steps) {
        if (s > targetMeters) break;
        bestStep = s;
    }
    const pixels = bestStep / metersPerPixel;
    const label = bestStep >= 1000 ? `${bestStep / 1000} km` : `${bestStep} m`;
    return { label, pixels };
}

export function MapScale({ map }: { map: MaptilerMap | null }) {
    const [scale, setScale] = useState<{ label: string; pixels: number }>({ label: "", pixels: 0 });

    useEffect(() => {
        if (!map) return;
        let frameId: number;
        const update = () => setScale(getScale(map));
        const onMove = () => {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(update);
        };
        update();
        map.on("move", onMove);
        map.on("zoom", onMove);
        return () => {
            map.off("move", onMove);
            map.off("zoom", onMove);
            if (frameId) cancelAnimationFrame(frameId);
        };
    }, [map]);

    if (!scale.label || !scale.pixels) return null;

    return (
        <div className="flex items-center gap-1.5 select-none pointer-events-none">
            <div
                className="h-1.5 border border-t-0 border-foreground/40"
                style={{ width: `${scale.pixels}px` }}
            />
            <span className="text-xs font-medium text-foreground/60">{scale.label}</span>
        </div>
    );
}
