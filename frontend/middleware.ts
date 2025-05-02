import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 1) Protect everything under "/" (all pages, but skip _next and static assets)
export const config = { matcher: ["/:path*"] };

export function middleware(req: NextRequest) {
    const auth = req.headers.get("authorization") || "";
    if (auth.startsWith("Basic ")) {
        const [u, p] = Buffer.from(auth.split(" ")[1], "base64")
            .toString().split(":", 1);
        if (u === process.env.BASIC_AUTH_USER && p === process.env.BASIC_AUTH_PASS) {
            return NextResponse.next();
        }
    }
    return new NextResponse("Auth required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private"' },
    });
}
