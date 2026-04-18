'use client';

import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { UserIcon, Settings, LogOut, FileText, Shield } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function Initials({ name }: { name?: string | null }) {
    const letter = (name || "?").charAt(0).toUpperCase();
    return (
        <span className="inline-flex items-center justify-center w-full h-full rounded-full bg-primary text-primary-foreground text-sm font-semibold select-none">
            {letter}
        </span>
    );
}

export default function User() {
    const { data: session } = useSession();
    const router = useRouter();
    const [open, setOpen] = useState(false);

    const displayName = session?.user?.displayName || session?.user?.name;
    const imageUrl = session?.user?.image || undefined;

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Avatar className="w-8 h-8">
                        <AvatarImage src={imageUrl} alt={displayName || "User"} />
                        <AvatarFallback>
                            <Initials name={displayName} />
                        </AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground truncate">
                            {displayName || "User"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                            {session?.user?.email}
                        </span>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`/u/${session?.user?.handle}`)}>
                    <UserIcon className="w-4 h-4" />
                    Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                    <Settings className="w-4 h-4" />
                    Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/legal/terms")}>
                    <FileText className="w-4 h-4" />
                    Terms
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/legal/privacy")}>
                    <Shield className="w-4 h-4" />
                    Privacy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="text-destructive focus:text-destructive"
                >
                    <LogOut className="w-4 h-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
