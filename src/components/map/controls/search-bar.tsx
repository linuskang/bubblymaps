"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import type { Waypoint } from "@/types/waypoints";

interface SearchBarProps {
    waypoints?: Waypoint[];
    onSelect?: (waypoint: Waypoint) => void;
}

export function SearchBar({ waypoints = [], onSelect }: SearchBarProps) {
    const [value, setValue] = useState("");
    const [debouncedValue, setDebouncedValue] = useState("");
    const [results, setResults] = useState<Waypoint[]>([]);
    const [showResults, setShowResults] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), 300);
        return () => clearTimeout(timer);
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!debouncedValue.trim()) { setResults([]); return; }
        const q = debouncedValue.toLowerCase();
        setResults(
            waypoints.filter(w => {
                const name = (w.name ?? "").toLowerCase();
                const desc = (w.description ?? "").toLowerCase();
                return name.includes(q) || desc.includes(q);
            }).slice(0, 6)
        );
    }, [debouncedValue, waypoints]);

    const handleSelect = (w: Waypoint) => {
        setValue(w.name ?? "");
        setShowResults(false);
        onSelect?.(w);
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-md w-72 sm:w-80 md:w-96">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                    type="text"
                    value={value}
                    onChange={e => { setValue(e.target.value); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                    placeholder={waypoints.length ? `Search ${waypoints.length.toLocaleString()} fountains…` : "Search fountains…"}
                    className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none shadow-none"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => { setValue(""); setResults([]); }}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {showResults && value.trim() && (
                <div className="absolute top-12 left-0 right-0 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden z-50">
                    {results.length > 0 ? results.map(w => (
                        <button
                            key={w.id}
                            onClick={() => handleSelect(w)}
                            className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors border-b border-border last:border-0"
                        >
                            <Search className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{w.name}</p>
                                {w.description && (
                                    <p className="text-xs text-muted-foreground truncate">{w.description}</p>
                                )}
                            </div>
                        </button>
                    )) : (
                        <p className="px-4 py-3 text-sm text-muted-foreground text-center">
                            {waypoints.length === 0 ? "Loading…" : `No results for "${value}"`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
