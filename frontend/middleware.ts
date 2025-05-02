import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 1) Protect everything under "/" (all pages, but skip _next and static assets)
export const config = {
    matcher: ["/:path*"],
};

export function middleware(req: NextRequest) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.startsWith("Basic ")) {
        // Edge runtime supports Buffer.from, not atob()
        const [user, pass] = Buffer
            .from(auth.split(" ")[1], "base64")
            .toString()
            .split(":");
        if (
            user === process.env.BASIC_AUTH_USER &&
            pass === process.env.BASIC_AUTH_PASS
        ) {
            return NextResponse.next();
        }
    }
    return new NextResponse("Auth required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
    });
}
