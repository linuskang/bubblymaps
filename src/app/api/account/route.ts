import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { Users } from "@/server/user/user";
import { logEndpointActivity } from "@/server/logging/discord";
import { isValidImageUrl } from "@/lib/utils";

export async function PATCH(request: NextRequest) {
    const session = await auth();

    if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { handle, displayname, bio, image } = await request.json();

    if (!handle && !displayname && bio === undefined && image === undefined) {
        return NextResponse.json({ success: false, error: "No account changes requested." }, { status: 400 });
    }

    if (handle !== undefined) {
        if (!handle || handle.trim().length === 0) {
            return NextResponse.json({ success: false, error: "Username cannot be empty." }, { status: 400 });
        }

        const normalizedHandle = handle.trim().toLowerCase();
        const HANDLE_REGEX = /^[a-z0-9_]{5,20}$/;

        if (!HANDLE_REGEX.test(normalizedHandle)) {
            return NextResponse.json({
                success: false,
                error: "Usernames must be 5–20 characters and may only contain letters, numbers, and underscores.",
            }, { status: 400 });
        }

        if (normalizedHandle.includes("__")) {
            return NextResponse.json({ success: false, error: "Usernames cannot contain consecutive underscores." }, { status: 400 });
        }

        if (await Users.isHandleReserved(handle)) {
            return NextResponse.json({ success: false, error: `The username '${handle}' is reserved.` }, { status: 400 });
        }

        if (await Users.isHandleTaken(handle, session.user.id)) {
            return NextResponse.json({ success: false, error: `The username '${handle}' is already taken.` }, { status: 400 });
        }
    }

    if (displayname !== undefined && displayname.trim().length === 0) {
        return NextResponse.json({ success: false, error: "Display name cannot be empty." }, { status: 400 });
    }

    if (image !== undefined) {
        if (typeof image !== "string") {
            return NextResponse.json({ success: false, error: "Profile image URL must be a string." }, { status: 400 });
        }
        if (image.trim() !== "" && !isValidImageUrl(image.trim())) {
            return NextResponse.json({ success: false, error: "Please provide a valid image URL (http/https, jpg/png/gif/webp)." }, { status: 400 });
        }
    }

    try {
        const updatedUser = await Users.edit(session.user.id, {
            handle,
            displayName: displayname,
            bio,
            image: image === undefined ? undefined : image.trim() || null,
        });

        await logEndpointActivity({
            action: "account.edit",
            route: "/api/account",
            status: "success",
            actor: { id: session.user.id, handle: session.user.handle },
            metadata: {
                changed: {
                    handle: handle !== undefined,
                    displayname: displayname !== undefined,
                    bio: bio !== undefined,
                    image: image !== undefined,
                },
            },
        });

        return NextResponse.json({ success: true, user: updatedUser }, { status: 200 });
    } catch (error: any) {

        await logEndpointActivity({
            action: "account.edit",
            route: "/api/account",
            status: "failed",
            actor: { id: session.user.id, handle: session.user.handle },
            reason: error?.message ?? "Unknown error",
        });

        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
