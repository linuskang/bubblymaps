"use client";

import { useEffect, useState } from "react";
import { Verified } from "@/components/badges/verified";

interface WaypointPopupProps {
    id: number;
    coordinates: [number, number];
    [key: string]: any;
}

function InitialsBadge({ name }: { name?: string | null }) {
    const letter = (name || "?").charAt(0).toUpperCase();
    return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
            {letter}
        </span>
    );
}

function Star({ fill, index, id }: { fill: number; index: number; id: number }) {
    const clipId = `clip-${id}-${index}`;
    const fillPct = Math.max(0, Math.min(100, fill));
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="inline-block">
            <defs>
                <clipPath id={clipId}>
                    <rect x="0" y="0" width={`${fillPct}%`} height="100%" />
                </clipPath>
            </defs>
            <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.789 1.402 8.171L12 18.896l-7.336 3.874 1.402-8.171L.132 9.21l8.2-1.192z" fill="var(--border)" />
            <g clipPath={`url(#${clipId})`}>
                <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.789 1.402 8.171L12 18.896l-7.336 3.874 1.402-8.171L.132 9.21l8.2-1.192z" fill="#fbbf24" />
            </g>
        </svg>
    );
}

export default function WaypointPopup({ id }: WaypointPopupProps) {
    const [name, setName] = useState<string | undefined>(undefined);
    const [desc, setDesc] = useState<string>("");
    const [verified, setVerified] = useState(false);
    const [maintainer, setMaintainer] = useState<string | undefined>(undefined);
    const [amenities, setAmenities] = useState<string[]>([]);
    const [addedBy, setAddedBy] = useState<any>(null);
    const [reviews, setReviews] = useState<any[]>([]);
    const [rating, setRating] = useState(0);

    useEffect(() => {
        fetch(`/api/waypoints/${id}`)
            .then(async (r) => {
                if (!r.ok) throw new Error(`Failed waypoint fetch: ${r.status}`);
                return r.json();
            })
            .then(data => {
                const w = data?.waypoint;
                if (!w) {
                    setName("Waypoint unavailable");
                    setDesc("");
                    setVerified(false);
                    setMaintainer(undefined);
                    setAmenities([]);
                    setAddedBy(null);
                    setReviews([]);
                    setRating(0);
                    return;
                }
                setName(w.name);
                setDesc(w.description || "");
                setVerified(w.verified);
                setMaintainer(w.maintainer);
                setAmenities(w.amenities || []);
                setAddedBy(w.addedBy || null);
                const revs = w.reviews || [];
                setReviews(revs);
                if (revs.length) {
                    const avg = revs.reduce((s: number, r: any) => s + (r?.rating || 0), 0) / revs.length;
                    setRating(Number(avg.toFixed(1)));
                } else {
                    setRating(0);
                }
            })
            .catch(console.error);
    }, [id]);

    return (
        <div className="w-64 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-border">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground leading-snug">
                        {name || "Loading…"}
                    </h3>
                    {verified && <Verified content={`Verified by ${maintainer}.`} />}
                </div>

                {reviews.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} fill={Math.max(0, Math.min(100, (rating - i) * 100))} index={i} id={id} />
                            ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{rating} ({reviews.length})</span>
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-3">
                {desc && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {desc.length > 100 ? desc.slice(0, 97) + "…" : desc}
                    </p>
                )}

                {amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {amenities.map((a, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                {a}
                            </span>
                        ))}
                    </div>
                )}

                {addedBy && (
                    <div className="flex items-center gap-2">
                        <InitialsBadge name={addedBy.displayName || addedBy.handle} />
                        <div className="min-w-0">
                            <a href={`/u/${addedBy.handle}`} className="text-xs font-medium text-foreground hover:underline underline-offset-2 truncate block">
                                {addedBy.displayName || addedBy.handle}
                            </a>
                            <span className="text-xs text-muted-foreground">Added this fountain</span>
                        </div>
                        {addedBy.verified && <Verified content="Official account of a government, organization, or recognized entity." />}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 pb-4">
                <a
                    href={`/w/${id}`}
                    className="block w-full text-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                    View details
                </a>
            </div>
        </div>
    );
}
