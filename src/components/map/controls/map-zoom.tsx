"use client";

import { Plus, Minus } from "lucide-react";
import type { Map } from "@maptiler/sdk";

export function MapZoom({ map }: { map: Map | null }) {
    return (
        <div className="flex flex-col rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-md overflow-hidden">
            {[
                { icon: <Plus className="w-4 h-4" />, label: "Zoom in", onClick: () => map?.zoomIn() },
                { icon: <Minus className="w-4 h-4" />, label: "Zoom out", onClick: () => map?.zoomOut() },
            ].map((b, i) => (
                <button
                    key={b.label}
                    type="button"
                    onClick={b.onClick}
                    aria-label={b.label}
                    className={`w-9 h-9 flex items-center justify-center text-foreground hover:bg-muted transition-colors cursor-pointer ${i === 0 ? "border-b border-border" : ""}`}
                >
                    {b.icon}
                </button>
            ))}
        </div>
    );
}
