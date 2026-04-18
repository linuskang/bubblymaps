'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
    MapPin, Star, Clock, Flag, Edit3, Share2,
    ChevronLeft, Droplets, ExternalLink, MoreHorizontal,
    AlertTriangle, History, Copy, Check, Plus,
    Pencil, Trash2, RefreshCw, ArrowRight,
} from 'lucide-react';
import { Footer } from '@/components/footer';
import type { Waypoint, WaypointLog } from '@/types/waypoints';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Verified } from '@/components/badges/verified';

interface Review {
    id: number;
    rating: number;
    comment?: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    user: { id: string; handle?: string; displayName?: string; verified?: boolean };
}

interface WaypointLogWithUser extends WaypointLog {
    user?: { id: string; handle?: string; displayName?: string; verified?: boolean };
}

interface WaypointWithReviews extends Waypoint {
    addedBy?: { id: string; handle?: string; displayName?: string; verified?: boolean };
    reviews?: Review[];
}

function UserBadge({ name, handle }: { name?: string; handle?: string }) {
    const label = name || handle || "?";
    return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
            {label.charAt(0).toUpperCase()}
        </span>
    );
}

function StarRow({ rating, interactive = false, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) {
    const [hover, setHover] = useState(0);
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
                <button
                    key={s}
                    type="button"
                    onClick={() => interactive && onChange?.(s)}
                    onMouseEnter={() => interactive && setHover(s)}
                    onMouseLeave={() => interactive && setHover(0)}
                    disabled={!interactive}
                    className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
                >
                    <Star className={`${interactive ? "w-7 h-7" : "w-4 h-4"} ${s <= (hover || rating) ? "fill-yellow-400 text-yellow-400" : "fill-muted text-muted"}`} />
                </button>
            ))}
        </div>
    );
}

function RelativeTime({ date }: { date: string | Date }) {
    const d = new Date(date), now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return <span>just now</span>;
    if (mins < 60) return <span>{mins}m ago</span>;
    if (hrs < 24) return <span>{hrs}h ago</span>;
    if (days < 7) return <span>{days}d ago</span>;
    return <span>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
}

const fieldLabels: Record<string, string> = {
    name: 'Name', description: 'Description', latitude: 'Latitude',
    longitude: 'Longitude', region: 'Region', maintainer: 'Maintainer',
    amenities: 'Amenities', image: 'Image', verified: 'Verified', approved: 'Approved',
};
function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v) || '—';
}
function changedFields(old?: Record<string, unknown> | null, next?: Record<string, unknown> | null) {
    const ignored = ['id', 'createdAt', 'updatedAt', 'addedByUserId', 'bubblerId'];
    const keys = new Set([...Object.keys(old || {}), ...Object.keys(next || {})]);
    return [...keys].filter(k => !ignored.includes(k) && JSON.stringify(old?.[k]) !== JSON.stringify(next?.[k]))
        .map(k => ({ field: k, old: old?.[k], new: next?.[k] }));
}

const actionStyles: Record<string, string> = {
    CREATE: 'bg-green-500/10 text-green-600 dark:text-green-400',
    UPDATE: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    DELETE: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function LoadingSkeleton() {
    return (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
            <Skeleton className="w-9 h-9 rounded-full" />
            <Skeleton className="w-full h-56 rounded-xl" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
        </div>
    );
}

export default function WaypointPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data: session } = useSession();

    const [waypoint, setWaypoint] = useState<WaypointWithReviews | null>(null);
    const [logs, setLogs] = useState<WaypointLogWithUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [reviewRating, setReviewRating] = useState(0);
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);
    const [showReviewForm, setShowReviewForm] = useState(false);

    const [reportOpen, setReportOpen] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);

    const [copied, setCopied] = useState(false);
    const [showAllHistory, setShowAllHistory] = useState(false);

    async function refresh() {
        const res = await fetch(`/api/waypoints/${id}`);
        const data = await res.json();
        setWaypoint(data.waypoint);
    }

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(`/api/waypoints/${id}`);
                if (!res.ok) throw new Error('Not found');
                const data = await res.json();
                setWaypoint(data.waypoint);
                if (data.logs) setLogs(data.logs);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    const handleSubmitReview = async () => {
        if (!reviewRating) return;
        setSubmittingReview(true);
        try {
            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: reviewRating, comment: reviewComment, bubblerId: Number(id) }),
            });
            if (!res.ok) throw new Error();
            await refresh();
            setReviewRating(0); setReviewComment(''); setShowReviewForm(false);
        } finally {
            setSubmittingReview(false);
        }
    };

    const handleDeleteReview = async (rid: number) => {
        if (!confirm('Delete this review?')) return;
        setDeletingReviewId(rid);
        try {
            await fetch(`/api/reviews?id=${rid}`, { method: 'DELETE' });
            await refresh();
        } finally {
            setDeletingReviewId(null);
        }
    };

    const handleReport = async () => {
        if (!reportReason.trim()) return;
        setSubmittingReport(true);
        try {
            await fetch(`/api/waypoints/${id}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reportReason }),
            });
            setReportOpen(false); setReportReason('');
        } finally {
            setSubmittingReport(false);
        }
    };

    const handleShare = async () => {
        const url = window.location.href;
        if (navigator.share) {
            navigator.share({ title: waypoint?.name, url }).catch(() => {});
        } else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const avgRating = waypoint?.reviews?.length
        ? waypoint.reviews.reduce((s, r) => s + r.rating, 0) / waypoint.reviews.length
        : 0;
    const userHasReviewed = waypoint?.reviews?.some(r => r.user.id === session?.user?.id);

    if (loading) return <div className="min-h-screen bg-background"><LoadingSkeleton /></div>;

    if (error || !waypoint) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                        <MapPin className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h1 className="text-lg font-semibold">Waypoint not found</h1>
                    <Button asChild variant="outline"><Link href="/">Go home</Link></Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <div className="max-w-2xl mx-auto w-full px-4 py-6 flex-1">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-6">
                    <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm"><MoreHorizontal className="w-5 h-5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleShare}>
                                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                                {copied ? 'Copied!' : 'Share'}
                            </DropdownMenuItem>
                            {session?.user && (
                                <>
                                    <DropdownMenuItem asChild>
                                        <Link href={`/w/${id}/edit`}><Edit3 className="w-4 h-4" />Edit</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setReportOpen(true)} className="text-destructive focus:text-destructive">
                                        <Flag className="w-4 h-4" />Report
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Image */}
                {waypoint.image ? (
                    <div className="w-full aspect-video rounded-xl overflow-hidden mb-6 bg-muted">
                        <img src={waypoint.image} alt={waypoint.name} className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div className="w-full aspect-video rounded-xl bg-muted flex items-center justify-center mb-6">
                        <Droplets className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                )}

                {/* Title */}
                <div className="mb-4">
                    <h1 className="text-2xl font-bold text-foreground leading-tight mb-1">
                        {waypoint.name}
                        {waypoint.verified && <span className="ml-2 inline-align-middle"><Verified content={`Verified by ${waypoint.maintainer}.`} /></span>}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {waypoint.region && (
                            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{waypoint.region}</span>
                        )}
                        {waypoint.region && waypoint.maintainer && <span>·</span>}
                        {waypoint.maintainer && <span>Maintained by {waypoint.maintainer}</span>}
                    </div>
                    {waypoint.reviews && waypoint.reviews.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                            <StarRow rating={Math.round(avgRating)} />
                            <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>
                            <span className="text-sm text-muted-foreground">({waypoint.reviews.length})</span>
                        </div>
                    )}
                </div>

                {/* Amenities */}
                {waypoint.amenities && waypoint.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {waypoint.amenities.map((a, i) => (
                            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-accent text-accent-foreground font-medium">
                                {a}
                            </span>
                        ))}
                    </div>
                )}

                {/* Description */}
                {waypoint.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">{waypoint.description}</p>
                )}

                {/* Meta row */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-6">
                    <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Added {new Date(waypoint.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <a
                        href={`/map?lat=${waypoint.latitude}&lng=${waypoint.longitude}&zoom=20`}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                        {waypoint.latitude.toFixed(4)}, {waypoint.longitude.toFixed(4)}
                        <ExternalLink className="w-3 h-3" />
                    </a>
                </div>

                {/* Added by */}
                {waypoint.addedBy?.handle && (
                    <div className="flex items-center gap-2.5 mb-6">
                        <Link href={`/u/${waypoint.addedBy.handle}`}>
                            <UserBadge name={waypoint.addedBy.displayName} handle={waypoint.addedBy.handle} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                                <Link href={`/u/${waypoint.addedBy.handle}`} className="hover:underline underline-offset-2">
                                    @{waypoint.addedBy.handle}
                                </Link>
                                {waypoint.addedBy.verified && <Verified content="Official account" />}
                            </div>
                            <span className="text-xs text-muted-foreground">Added this waypoint</span>
                        </div>
                    </div>
                )}

                <Separator className="mb-6" />

                {/* Reviews */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-semibold">Reviews</h2>
                        {!showReviewForm && !userHasReviewed && session?.user && (
                            <Button variant="ghost" size="sm" onClick={() => setShowReviewForm(true)}>
                                <Plus className="w-4 h-4" />Add review
                            </Button>
                        )}
                    </div>

                    {showReviewForm && (
                        <div className="rounded-xl border border-border bg-muted/40 p-4 mb-5 space-y-3">
                            <div className="flex justify-center">
                                <StarRow rating={reviewRating} interactive onChange={setReviewRating} />
                            </div>
                            <Textarea
                                placeholder="Share your experience (optional)"
                                value={reviewComment}
                                onChange={e => setReviewComment(e.target.value)}
                                rows={2}
                                className="resize-none"
                            />
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => { setShowReviewForm(false); setReviewRating(0); setReviewComment(''); }}>
                                    Cancel
                                </Button>
                                <Button className="flex-1" disabled={!reviewRating || submittingReview} onClick={handleSubmitReview}>
                                    {submittingReview ? 'Submitting…' : 'Submit'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {!session?.user && (
                        <div className="rounded-xl border border-border bg-muted/40 p-5 mb-5 text-center space-y-2">
                            <p className="text-sm font-medium">Have you been here?</p>
                            <p className="text-xs text-muted-foreground">Sign in to leave a review.</p>
                            <Button size="sm" asChild className="mt-1"><Link href="/login">Sign in</Link></Button>
                        </div>
                    )}

                    {waypoint.reviews && waypoint.reviews.length > 0 ? (
                        <div className="space-y-3">
                            {waypoint.reviews.map(review => (
                                <div key={review.id} className="rounded-lg border border-border p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <Link href={`/u/${review.user.handle}`}>
                                                <UserBadge name={review.user.displayName} handle={review.user.handle} />
                                            </Link>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <Link href={`/u/${review.user.handle}`} className="text-sm font-medium hover:underline underline-offset-2">
                                                        @{review.user.handle}
                                                    </Link>
                                                    {review.user.verified && <Verified content="Official account" />}
                                                    <span className="text-xs text-muted-foreground">·</span>
                                                    <span className="text-xs text-muted-foreground"><RelativeTime date={review.createdAt} /></span>
                                                </div>
                                                <StarRow rating={review.rating} />
                                            </div>
                                        </div>
                                        {session?.user?.id === review.user.id && (
                                            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive shrink-0"
                                                onClick={() => handleDeleteReview(review.id)} disabled={deletingReviewId === review.id}>
                                                {deletingReviewId === review.id
                                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    : <Trash2 className="w-3.5 h-3.5" />}
                                            </Button>
                                        )}
                                    </div>
                                    {review.comment && (
                                        <p className="text-sm text-muted-foreground mt-2 ml-9 leading-relaxed">{review.comment}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-6">No reviews yet</p>
                    )}
                </div>

                {/* History */}
                {logs.length > 0 && (
                    <>
                        <Separator className="mb-6" />
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <History className="w-3.5 h-3.5" />Edit history
                                </h2>
                                {logs.length > 3 && (
                                    <button onClick={() => setShowAllHistory(v => !v)} className="text-xs text-primary hover:underline underline-offset-2">
                                        {showAllHistory ? 'Show less' : `All ${logs.length}`}
                                    </button>
                                )}
                            </div>
                            <div className="space-y-0.5">
                                {(showAllHistory ? logs : logs.slice(0, 3)).map(log => {
                                    const changes = changedFields(log.oldData, log.newData);
                                    return (
                                        <Collapsible key={log.id}>
                                            <CollapsibleTrigger asChild>
                                                <button className="w-full flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg hover:bg-muted transition-colors text-left">
                                                    <span className={`p-1 rounded-full text-xs ${actionStyles[log.action] || 'bg-muted'}`}>
                                                        {log.action === 'CREATE' ? <Plus className="w-3 h-3" /> : log.action === 'UPDATE' ? <Pencil className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                                                    </span>
                                                    <span className="flex-1 text-sm text-muted-foreground">
                                                        {log.user?.handle ? (
                                                            <Link href={`/u/${log.user.handle}`} className="font-medium text-foreground hover:underline" onClick={e => e.stopPropagation()}>
                                                                @{log.user.handle}
                                                            </Link>
                                                        ) : <span className="font-medium text-foreground">@deleted</span>}
                                                        {' '}{log.action === 'CREATE' ? 'added' : log.action === 'UPDATE' ? 'edited' : 'deleted'} this waypoint
                                                    </span>
                                                    <span className="text-xs text-muted-foreground shrink-0"><RelativeTime date={log.createdAt} /></span>
                                                </button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <div className="ml-8 pl-3 border-l border-border my-2 space-y-2">
                                                    {log.action === 'CREATE' && log.newData && Object.entries(log.newData as Record<string, unknown>)
                                                        .filter(([k]) => !['id', 'addedByUserId', 'createdAt', 'updatedAt', 'bubblerId'].includes(k))
                                                        .map(([k, v]) => (
                                                            <div key={k} className="text-xs">
                                                                <span className="text-muted-foreground">{fieldLabels[k] || k}: </span>
                                                                <span className="text-foreground font-mono">{fmtVal(v)}</span>
                                                            </div>
                                                        ))
                                                    }
                                                    {log.action === 'UPDATE' && changes.map(c => (
                                                        <div key={c.field} className="text-xs">
                                                            <span className="text-muted-foreground block mb-0.5">{fieldLabels[c.field] || c.field}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-destructive/70 line-through">{fmtVal(c.old)}</span>
                                                                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                                                <span className="font-mono text-foreground">{fmtVal(c.new)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {log.action === 'DELETE' && <span className="text-xs text-destructive">Waypoint deleted</span>}
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <Footer />

            {/* Report dialog */}
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                            Report waypoint
                        </DialogTitle>
                        <DialogDescription>Describe the issue with this waypoint.</DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="What's wrong with this waypoint?"
                        value={reportReason}
                        onChange={e => setReportReason(e.target.value)}
                        rows={4}
                        className="resize-none"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                        <Button variant="destructive" disabled={!reportReason.trim() || submittingReport} onClick={handleReport}>
                            {submittingReport ? 'Submitting…' : 'Report'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
