"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { ArrowLeft } from "lucide-react";
import Loading from "@/components/loading";
import { useRouter } from "next/navigation";
import { isValidImageUrl } from "@/lib/utils";

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [displayName, setDisplayName] = useState("");
    const [username, setUsername] = useState("");
    const [bio, setBio] = useState("");
    const [image, setImage] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (session?.user) {
            setDisplayName(session.user.displayName ?? "");
            setUsername(session.user.handle ?? "");
            setBio(session.user.bio ?? "");
            setImage(session.user.image ?? "");
        }
    }, [session?.user?.handle, session?.user?.displayName, session?.user?.bio, session?.user?.image]);

    if (status === "loading") return <Loading />;

    if (!session) {
        router.replace("/login");
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (image.trim() !== "" && !isValidImageUrl(image.trim())) {
            toast.error("Please provide a valid image URL (http/https, jpg/png/gif/webp).");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/account", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ handle: username, displayname: displayName, bio, image }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Settings saved.");
            } else {
                toast.error(data.error || "Something went wrong.");
            }
        } catch {
            toast.error("Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    const inputClass = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring shadow-sm";

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <div className="p-4">
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 pb-16">
                <div className="w-full max-w-sm space-y-8">

                    <div>
                        <h1 className="text-xl font-semibold text-foreground">Account settings</h1>
                        <p className="text-sm text-muted-foreground mt-1">{session.user.email}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Display name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                placeholder="Your name"
                                className={inputClass}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Username</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value.toLowerCase())}
                                    placeholder="username"
                                    className={`${inputClass} pl-7`}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">5–20 characters, letters, numbers and underscores only.</p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Bio</label>
                            <textarea
                                value={bio}
                                onChange={e => setBio(e.target.value)}
                                rows={3}
                                placeholder="A short bio about yourself…"
                                className={`${inputClass} resize-none`}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Profile image URL</label>
                            <input
                                type="url"
                                value={image}
                                onChange={e => setImage(e.target.value)}
                                placeholder="https://example.com/avatar.jpg"
                                className={inputClass}
                            />
                            <p className="text-xs text-muted-foreground">Leave empty to use initials.</p>
                        </div>

                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? "Saving…" : "Save changes"}
                        </Button>
                    </form>

                    <div className="pt-2 border-t border-border">
                        <Button
                            variant="ghost"
                            className="w-full text-muted-foreground hover:text-destructive"
                            onClick={() => signOut({ callbackUrl: "/" })}
                        >
                            Sign out
                        </Button>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}
