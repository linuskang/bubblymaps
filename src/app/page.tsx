'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/footer';
import Header from '@/components/header';

interface Stats {
    totalWaypoints: number;
    totalVerifiedWaypoints: number;
    totalUsers: number;
}

interface SearchResult {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    region?: string;
}

export default function HomePage() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [stats, setStats] = useState<Stats | null>(null);
    const [showResults, setShowResults] = useState(false);

    useEffect(() => {
        fetch('/api/stats')
            .then(r => r.json())
            .then(setStats)
            .catch(() => {});
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        if (!debouncedQuery.trim()) { setResults([]); return; }
        setLoading(true);
        fetch(`/api/waypoints/search?q=${encodeURIComponent(debouncedQuery)}`)
            .then(r => r.json())
            .then(d => { setResults(d.waypoints ?? []); setShowResults(true); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [debouncedQuery]);

    const handleSelect = (r: SearchResult) => {
        setShowResults(false);
        setQuery('');
        router.push(`/map?lat=${r.latitude}&lng=${r.longitude}&zoom=18`);
    };

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Header />

            {/* Hero */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
                <div className="w-full max-w-2xl mx-auto text-center space-y-8">

                    <div className="space-y-4">
                        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
                            Find water fountains,{' '}
                            <span className="text-primary">anywhere.</span>
                        </h1>
                        <p className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
                            A community-maintained map of public water bubblers, fountains, and refill stations.
                        </p>
                    </div>

                    {/* Search */}
                    <div className="relative w-full max-w-md mx-auto">
                        <div className="relative flex items-center">
                            <Search className="absolute left-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                value={query}
                                onChange={e => { setQuery(e.target.value); setShowResults(true); }}
                                onFocus={() => results.length > 0 && setShowResults(true)}
                                placeholder="Search fountains by name or region…"
                                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
                            />
                            {loading && (
                                <Loader2 className="absolute right-3.5 w-4 h-4 text-muted-foreground animate-spin" />
                            )}
                        </div>

                        {showResults && query && (results.length > 0 || (!loading && debouncedQuery)) && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
                                {results.length > 0 ? (
                                    <ul>
                                        {results.map(r => (
                                            <li key={r.id}>
                                                <button
                                                    onClick={() => handleSelect(r)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors border-b border-border last:border-0"
                                                >
                                                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-foreground truncate">{r.name}</div>
                                                        {r.region && <div className="text-xs text-muted-foreground truncate">{r.region}</div>}
                                                    </div>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="px-4 py-3 text-sm text-muted-foreground text-center">No results for "{query}"</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Quick links */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="text-xs text-muted-foreground mr-1">Browse:</span>
                        {[
                            { label: 'Sydney', href: '/map?lat=-33.8688&lng=151.2093&zoom=12' },
                            { label: 'Melbourne', href: '/map?lat=-37.8136&lng=144.9631&zoom=12' },
                            { label: 'Brisbane', href: '/map?lat=-27.4698&lng=153.0251&zoom=12' },
                        ].map(c => (
                            <Button key={c.label} variant="outline" size="sm" asChild>
                                <Link href={c.href}>{c.label}</Link>
                            </Button>
                        ))}
                    </div>

                    {/* Stats */}
                    {stats && (
                        <div className="flex items-center justify-center gap-8 pt-6 border-t border-border">
                            {[
                                { value: stats.totalWaypoints.toLocaleString(), label: 'Fountains' },
                                { value: stats.totalVerifiedWaypoints.toLocaleString(), label: 'Verified' },
                                { value: stats.totalUsers.toLocaleString(), label: 'Contributors' },
                            ].map(s => (
                                <div key={s.label} className="text-center">
                                    <div className="text-xl font-bold text-foreground tabular-nums">{s.value}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
