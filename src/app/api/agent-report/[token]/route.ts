// Public GEO-agent report endpoint (AGENT_BUILD_PLAN §2/§5.4): capability-
// authenticated, rate-limited, no-index. The 256-bit token in the path is the
// entire authorization — links are durable but not confidential. The token is
// hashed before any lookup (only hashes touch SQL); the ETag is the report's
// SHA-256 (immutable, C-3). No auth session required: buyers are anonymous
// agents holding the capability URL from their deliverable.

import { verifyCapabilityToken } from "@/core/agent-envelope";
import { sha256Hex } from "@/core/canonical-json";
import { getPublishedDeliverableByCapabilityHash } from "@/db/repositories/agent-commerce";

export const dynamic = "force-dynamic";

// Fixed-window per-IP rate limit. In-memory is correct for the single-instance
// web service (§5.2 — no Redis at launch); the window resets on deploy, which
// only ever loosens the limit.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const hits = new Map<string, { windowStart: number; count: number }>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { windowStart: now, count: 1 });
    if (hits.size > 10_000) {
      for (const [key, value] of hits) {
        if (now - value.windowStart >= RATE_LIMIT_WINDOW_MS) hits.delete(key);
      }
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

const NOT_FOUND = () =>
  new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "Content-Type": "application/json", "X-Robots-Tag": "noindex" },
  });

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60", "X-Robots-Tag": "noindex" },
    });
  }

  const { token } = await params;
  // Shape-gate before hashing; hash before lookup (the raw token never reaches SQL).
  if (!/^[0-9a-f]{64}$/.test(token)) return NOT_FOUND();
  const row = await getPublishedDeliverableByCapabilityHash(sha256Hex(token));
  // Constant-time confirmation of the exact stored hash (defense in depth on
  // top of the indexed lookup).
  if (!row || !row.reportJson || !verifyCapabilityToken(token, row.capabilityHash ?? "")) {
    return NOT_FOUND();
  }

  const etag = `"${row.reportSha256}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "X-Robots-Tag": "noindex" } });
  }
  return new Response(JSON.stringify(row.reportJson), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      // Immutable by construction (C-3): the digest IS the identity.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Robots-Tag": "noindex",
    },
  });
}
