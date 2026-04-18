'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import User from '@/components/user';

export default function Header() {
    const { data: session } = useSession();

    return (
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                <Link href="/" className="font-semibold text-sm tracking-tight text-foreground">
                    Bubbly Maps
                </Link>
                <nav className="flex items-center gap-2">
                    {session ? (
                        <User />
                    ) : (
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/login">Sign in</Link>
                        </Button>
                    )}
                    <Button size="sm" asChild>
                        <Link href="/map">Open Map</Link>
                    </Button>
                </nav>
            </div>
        </header>
    );
}
