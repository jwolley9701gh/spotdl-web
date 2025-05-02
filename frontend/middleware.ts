import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// match _everything_ except the Next.js internal assets
export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};

export function middleware(req: NextRequest) {
    console.log("[🛡️ BasicAuth] hitting middleware for:", req.nextUrl.pathname);

    const auth = req.headers.get("authorization") || "";
    if (auth.startsWith("Basic ")) {
        const [user, pass] = Buffer
            .from(auth.split(" ")[1], "base64")
            .toString()
            .split(":", 1);

        if (
            user === process.env.BASIC_AUTH_USER &&
            pass === process.env.BASIC_AUTH_PASS
        ) {
            console.log("[🛡️ BasicAuth] success for", user);
            return NextResponse.next();
        } else {
            console.log("[🛡️ BasicAuth] bad creds", user);
        }
    } else {
        console.log("[🛡️ BasicAuth] no auth header");
    }

    return new NextResponse("Auth required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
    });
}
