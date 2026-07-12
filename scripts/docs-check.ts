/**
 * pnpm docs:check — documentation-governance validator (D-107).
 *
 * Validates the discipline MASTER_CONTEXT §7/§8 declares:
 *  1. Every governed root .md carries a valid first-line lifecycle header
 *     (`> LIFECYCLE: … · ROLE: … · OWNS: …`), and no root doc is HISTORICAL.
 *  2. Every docs/history/*.md is HISTORICAL and carries a DISPOSITION.
 *  3. STATUS.md exists, names exactly one active product, carries the required
 *     fields, and every local file it links to exists.
 *  4. Exactly one ACTIVE ROLE: PLAN exists in root (the active build plan).
 *  5. Local markdown links in governed docs resolve to real files.
 *  6. DECISIONS.md exists; supersession-register edges reference decision IDs
 *     that exist, point forward (successor > predecessor), and no predecessor
 *     appears twice (chains are followed forward, so no cycles are possible).
 *  7. No unclassified root .md appears silently (exempt: CLAUDE.md, AGENTS.md).
 *
 * Pure Node, no dependencies. Exits non-zero with readable errors.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const HISTORY = join(ROOT, "docs", "history");
const EXEMPT = new Set(["CLAUDE.md", "AGENTS.md"]);

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

const HEADER_RE =
  /^> LIFECYCLE: (ACTIVE|PARKED|HISTORICAL) · ROLE: (CANON|PLAN|PLAYBOOK|RECORD) · OWNS: .+/;

function headerOf(path: string): { lifecycle: string; role: string; line: string } | null {
  const first = readFileSync(path, "utf8").split("\n", 1)[0] ?? "";
  const m = first.match(HEADER_RE);
  return m ? { lifecycle: m[1], role: m[2], line: first } : null;
}

// ---- 1 + 7: root governed docs -------------------------------------------
const rootMd = readdirSync(ROOT).filter((f) => f.endsWith(".md"));
const rootHeaders = new Map<string, { lifecycle: string; role: string; line: string }>();
for (const f of rootMd) {
  if (EXEMPT.has(f)) continue;
  const h = headerOf(join(ROOT, f));
  if (!h) {
    fail(`${f}: missing or malformed lifecycle header (expected first line '> LIFECYCLE: … · ROLE: … · OWNS: …')`);
    continue;
  }
  if (h.lifecycle === "HISTORICAL") {
    fail(`${f}: LIFECYCLE HISTORICAL docs must live in docs/history/, not root`);
  }
  rootHeaders.set(f, h);
}

// ---- 2: docs/history ------------------------------------------------------
if (existsSync(HISTORY)) {
  for (const f of readdirSync(HISTORY).filter((f) => f.endsWith(".md"))) {
    const p = join(HISTORY, f);
    const h = headerOf(p);
    if (!h) {
      fail(`docs/history/${f}: missing or malformed lifecycle header`);
      continue;
    }
    if (h.lifecycle !== "HISTORICAL") fail(`docs/history/${f}: must be LIFECYCLE: HISTORICAL (is ${h.lifecycle})`);
    if (!/· DISPOSITION: (EXECUTED|SUPERSEDED BY .+)/.test(h.line))
      fail(`docs/history/${f}: header must carry '· DISPOSITION: EXECUTED' or '· DISPOSITION: SUPERSEDED BY …'`);
  }
}

// ---- 3: STATUS.md ---------------------------------------------------------
const statusPath = join(ROOT, "STATUS.md");
if (!existsSync(statusPath)) {
  fail("STATUS.md: missing — it is the required active control plane (D-107)");
} else {
  const status = readFileSync(statusPath, "utf8");
  for (const field of ["Active product", "Branch", "Current gate", "Gate state", "Next action", "Parked product"]) {
    if (!status.includes(`**${field}**`)) fail(`STATUS.md: required field '${field}' missing`);
  }
  const activeCount = (status.match(/\*\*Active product\*\*/g) ?? []).length;
  if (activeCount !== 1) fail(`STATUS.md: exactly one 'Active product' row required (found ${activeCount})`);
}

// ---- 4: exactly one active plan --------------------------------------------
const activePlans = [...rootHeaders.entries()].filter(
  ([, h]) => h.lifecycle === "ACTIVE" && h.role === "PLAN",
);
if (activePlans.length !== 1)
  fail(`root: expected exactly one ACTIVE ROLE: PLAN doc (the active build plan); found ${activePlans.length}: ${activePlans.map(([f]) => f).join(", ") || "none"}`);

// ---- 5: local markdown links resolve ---------------------------------------
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
function checkLinks(path: string, rel: string) {
  const text = readFileSync(path, "utf8");
  let inFence = false;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    for (const m of line.matchAll(LINK_RE)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const clean = target.split("#")[0];
      if (!clean) continue;
      const abs = resolve(dirname(path), decodeURIComponent(clean));
      if (!existsSync(abs)) fail(`${rel}: broken local link -> ${target}`);
    }
  }
}
for (const f of rootMd) if (!EXEMPT.has(f)) checkLinks(join(ROOT, f), f);
if (existsSync(HISTORY))
  for (const f of readdirSync(HISTORY).filter((f) => f.endsWith(".md")))
    checkLinks(join(HISTORY, f), `docs/history/${f}`);

// ---- 6: DECISIONS.md + supersession register --------------------------------
const decisionsPath = join(ROOT, "DECISIONS.md");
if (!existsSync(decisionsPath)) {
  fail("DECISIONS.md: missing — the Decision Log home (D-107)");
} else {
  const decisions = readFileSync(decisionsPath, "utf8");
  const ids = new Set([...decisions.matchAll(/^\| (D-\d{3}) \|/gm)].map((m) => m[1]));
  if (ids.size === 0) fail("DECISIONS.md: no decision rows found (expected '| D-0NN |' table rows)");
  const registerSection = decisions.split("## Supersession register")[1]?.split("\n## ")[0] ?? "";
  const edges = [...registerSection.matchAll(/^\| (D-\d{3}) \| (D-\d{3}) \|/gm)].map((m) => [m[1], m[2]] as const);
  const seen = new Set<string>();
  for (const [oldId, newId] of edges) {
    if (!ids.has(oldId)) fail(`supersession register: predecessor ${oldId} has no decision row`);
    if (!ids.has(newId)) fail(`supersession register: successor ${newId} has no decision row`);
    const oldN = Number(oldId.slice(2));
    const newN = Number(newId.slice(2));
    if (newN <= oldN) fail(`supersession register: ${oldId} -> ${newId} does not point forward`);
    if (seen.has(oldId)) fail(`supersession register: duplicate predecessor ${oldId} (one edge per superseded decision; point to the governing successor)`);
    seen.add(oldId);
  }
}

// ---- report -----------------------------------------------------------------
if (errors.length > 0) {
  console.error(`docs:check FAILED — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
const historyCount = existsSync(HISTORY) ? readdirSync(HISTORY).filter((f) => f.endsWith(".md")).length : 0;
console.log(`docs:check OK — ${rootHeaders.size} governed root docs, ${historyCount} historical, register valid, links resolve.`);
