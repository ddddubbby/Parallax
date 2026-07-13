import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/core/auth";
import { SESSION_COOKIE } from "@/modules/auth/constants";

// Node runtime, not the Edge default: verifySession uses node:crypto
// (timingSafeEqual/createHmac), which Edge does not fully support. Next.js
// 15.2+ supports this opt-in as a stable feature.
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|health$).*)"],
};

const PUBLIC_PATHS = new Set(["/login"]);

// The GEO-agent report endpoint is capability-authenticated (256-bit token in
// the path IS the authorization — AGENT_BUILD_PLAN §2/§5.4) and is fetched by
// anonymous buyer agents, never by the logged-in operator. It carries its own
// rate limit and no-index headers in the route handler.
const PUBLIC_PREFIXES = ["/api/agent-report/"];

// Local-dev-only bypass for UI testing (ST-6 stays enforced everywhere
// else). Double-guarded: APP_ENV must not be "production" (Render always
// sets it to "production" — see render.yaml — so this can never fire on a
// real deploy even if DISABLE_AUTH leaked into prod env vars by mistake),
// and DISABLE_AUTH must be explicitly "true" in .env.local (gitignored,
// never committed). Remove both the flag and this block before any
// client-facing use.
function isProductionRuntime() {
  return process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
}

const AUTH_DISABLED = !isProductionRuntime() && process.env.DISABLE_AUTH === "true";

export function middleware(request: NextRequest) {
  if (
    AUTH_DISABLED ||
    PUBLIC_PATHS.has(request.nextUrl.pathname) ||
    PUBLIC_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))
  ) {
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
