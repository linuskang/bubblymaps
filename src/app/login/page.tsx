"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (session) router.replace("/");
    }, [session, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const result = await signIn("resend", {
            email,
            callbackUrl: "/",
            redirect: false,
        });

        setIsLoading(false);

        if (result?.error) {
            toast.error("Something went wrong. Please try again.");
        } else {
            setSent(true);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <div className="p-4">
                <button
                    onClick={() => router.push("/")}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 pb-16">
                <div className="w-full max-w-sm space-y-8">
                    {/* Logo */}
                    <div className="text-center">
                        <h1 className="text-xl font-semibold tracking-tight text-foreground">Bubbly Maps</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {sent ? "Check your inbox" : "Sign in to your account"}
                        </p>
                    </div>

                    {sent ? (
                        <div className="rounded-lg border border-border bg-muted/50 p-6 text-center space-y-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="text-sm font-medium text-foreground">Link sent to {email}</p>
                            <p className="text-xs text-muted-foreground">Check your spam folder if you don't see it within a minute.</p>
                            <button
                                onClick={() => { setSent(false); setEmail(""); }}
                                className="text-xs text-primary hover:underline underline-offset-2"
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="email" className="text-sm font-medium text-foreground">
                                    Email address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
                                />
                            </div>
                            <Button type="submit" disabled={isLoading} className="w-full">
                                {isLoading ? "Sending link…" : "Continue with Email"}
                            </Button>
                            <p className="text-xs text-center text-muted-foreground">
                                We'll email you a magic link — no password needed.
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
