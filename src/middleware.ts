import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/core/auth";
import { SESSION_COOKIE } from "@/modules/auth/constants";

// Node runtime, not the Edge default: verifySession uses node:crypto
// (timingSafeEqual/createHmac), which Edge does not fully support. Next.js
// 15.2+ supports this opt-in as a stable feature.
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|health).*)"],
};

const PUBLIC_PATHS = new Set(["/login"]);

export function middleware(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  const valid = token && secret ? verifySession(token, secret) !== null : false;

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
