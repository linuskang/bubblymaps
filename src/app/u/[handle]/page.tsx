import Link from "next/link";
import { MapPin, MessageSquare, Edit3 } from "lucide-react";
import { Verified } from "@/components/badges/verified";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "@/server/user/user";
import { Footer } from "@/components/footer";

interface ProfilePageParams {
    params: Promise<{ handle: string }>;
}

function UserAvatar({ name, image }: { name?: string | null; image?: string | null }) {
    const letter = (name || "?").charAt(0).toUpperCase();
    return (
        <Avatar className="w-20 h-20 border border-border/40">
            <AvatarImage src={image || undefined} alt={name || "User"} className="object-cover" />
            <AvatarFallback className="text-3xl font-bold">
                {letter}
            </AvatarFallback>
        </Avatar>
    );
}

export default async function ProfilePage({ params }: ProfilePageParams) {
    const { handle } = await params;
    const user = await Users.getUserByUsername(handle);

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <div className="text-center space-y-4">
                    <h1 className="text-6xl font-black text-muted/40">404</h1>
                    <p className="text-sm text-muted-foreground">This user doesn't exist.</p>
                    <Button asChild variant="outline"><Link href="/">Go home</Link></Button>
                </div>
            </div>
        );
    }

    const contributions = await Users.getUserContributions(user.id);

    const all = [
        ...contributions.bubblers.map(b => ({ type: 'bubbler' as const, data: b, date: b.createdAt })),
        ...contributions.reviews.map(r => ({ type: 'review' as const, data: r, date: r.createdAt })),
        ...contributions.logs
            .filter(l => l.action !== 'CREATE')
            .map(l => ({ type: 'log' as const, data: l, date: l.createdAt })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalContributions = contributions.totalBubblers + contributions.totalReviews + contributions.totalEdits;

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <div className="max-w-xl mx-auto w-full px-4 py-10 flex-1">

                {/* Profile header */}
                <div className="flex flex-col items-center gap-3 mb-8 text-center">
                    <UserAvatar name={user.displayName || user.handle} image={user.image} />
                    <div>
                        <h1 className="text-xl font-bold text-foreground">{user.displayName || user.handle}</h1>
                        <div className="flex items-center justify-center gap-1.5 mt-0.5">
                            <span className="text-sm text-muted-foreground">@{user.handle}</span>
                            {user.verified && <Verified content="Official account of a government, organization, or recognized entity." />}
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 divide-x divide-border border border-border rounded-xl mb-8">
                    {[
                        { value: user.xp.toLocaleString(), label: 'XP' },
                        { value: totalContributions.toLocaleString(), label: 'Contributions' },
                        { value: user.createdAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), label: 'Joined' },
                    ].map(s => (
                        <div key={s.label} className="py-4 text-center">
                            <div className="text-base font-bold text-foreground tabular-nums">{s.value}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Bio */}
                {user.bio && (
                    <div className="rounded-xl border border-border bg-muted/40 p-4 mb-8">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                            {user.bio.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                                /^https?:\/\//.test(part) ? (
                                    <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                                        className="text-primary hover:underline underline-offset-2">{part}</a>
                                ) : <span key={i}>{part}</span>
                            )}
                        </p>
                    </div>
                )}

                {/* Activity */}
                <div>
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Activity</h2>

                    {all.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No contributions yet</p>
                    ) : (
                        <div className="space-y-2">
                            {all.map((c, i) => {
                                const iconClass = "w-4 h-4";
                                const bgColors = { bubbler: 'bg-blue-500/10 text-blue-500', review: 'bg-green-500/10 text-green-500', log: 'bg-amber-500/10 text-amber-500' };
                                const icons = {
                                    bubbler: <MapPin className={iconClass} />,
                                    review: <MessageSquare className={iconClass} />,
                                    log: <Edit3 className={iconClass} />,
                                };
                                const href = c.type === 'bubbler'
                                    ? `/w/${(c.data as any).id}`
                                    : c.type === 'review'
                                        ? `/w/${(c.data as any).bubbler?.id}`
                                        : `/w/${(c.data as any).bubbler?.id}`;
                                const name = c.type === 'bubbler'
                                    ? (c.data as any).name
                                    : (c.data as any).bubbler?.name;
                                const label = c.type === 'bubbler' ? 'Added bubbler' : c.type === 'review' ? 'Left a review' : 'Updated info';

                                return (
                                    <Link
                                        key={`${c.type}-${i}`}
                                        href={href || '#'}
                                        className="flex items-center justify-between p-3.5 rounded-lg border border-border hover:bg-muted transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bgColors[c.type]}`}>
                                                {icons[c.type]}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{name || 'Unnamed'}</p>
                                                <p className="text-xs text-muted-foreground">{label}</p>
                                            </div>
                                        </div>
                                        <time className="text-xs text-muted-foreground shrink-0 ml-3">
                                            {new Date(c.date).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric',
                                                year: new Date(c.date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                                            })}
                                        </time>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            <Footer />
        </div>
    );
}
