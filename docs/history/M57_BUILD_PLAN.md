> LIFECYCLE: HISTORICAL · ROLE: PLAN · OWNS: M57 pivot implementation, with form and launch work carried forward · DISPOSITION: SUPERSEDED BY M58_BUILD_PLAN.md

# M57 — Pivot to Windtunnel: brand, site compliance, SEO foundation

## Outcome

Every surface a human, a search engine, or an LLM can see says **Windtunnel** (one spelling, capital W; lowercase `windtunnel` only in the site wordmark). The live site obeys the D-127 lexicon and gains: one page per real study, definition pages for every method term, `/methodology`, inline JSON-LD, explicit AI-crawler robots groups, `llms.txt`, a `www`→apex 301, and a working contact form; `resonance.observer` redirects 301 for at least twelve months. The governance docs record all of it. No product behavior change: no migration, no new dependency, no identifier rename.

## Scope walls

- Renamed: visible surfaces only — `site/` (all pages, `og.svg`/`og.jpg`, `assets/mark.svg` wordmark aria, email links, domain), `public/brand/brand-kit.html`, living root docs' prose, and the operator-UI/report/export strings in `src/` listed in the plan handoff (single `PRODUCT_NAME` constant plus explicit literal edits).
- Never renamed (D-063/D-119 compatibility identifiers): `parallax` package/DB/cookie/service names; `Resonance*`/`resonance*` TypeScript identifiers; `src/modules/resonance`; `/resonance`; `matrixKind "resonance"`; `resonance_*` scope keys; DB values; migrations; script names `demo:resonance`/`recompute:resonance`; file names under `src/`, `scripts/`, `public/brand/resonance-*`. `DECISIONS.md` rows and `docs/history/` are never rewritten.
- Product wall: `git diff --stat origin/main -- drizzle package.json pnpm-lock.yaml` stays empty for the whole milestone; `src/` changes are limited to the P1b string/constant edits and their tests.
- Study pages publish only dev-DB-verified figures (D-127); never placeholders. If the dev DB is unavailable, P2b ships nothing and the STATUS follow-up stays.
- Operator-gated (not the engineer's): domain purchase + Vercel attach, mailbox, profile URLs, form endpoint, trademark search, Search Console/Bing submission. Never invent profile URLs or endpoints.
- Never `git add -A`; never `pnpm build` while `pnpm dev` runs (D-075); never point ad-hoc scripts at the dev DB (D-073); `set-site-domain.sh` uses BSD `sed -i ''` (macOS).

## Phases

1. **P0** Governance: D-128 + two register edges; archive `M56_BUILD_PLAN.md` (byte-frozen); `M57_BUILD_PLAN.md`; STATUS control plane; BUILD_NOTES S-130 truncation + S-131; DEVELOPMENT_GUIDELINES §G proxy gotcha; PROTECTED_REGISTER M57 section; PRD banner/rows; MASTER_CONTEXT §7 row.
2. **P1a** External surfaces: `site/index.html`, `studies.html`, `404.html`, `og.svg`/`og.jpg` re-render, `assets/mark.svg`, `brand-kit.html`; `set-site-domain.sh` extended (every HTML page, `robots.txt`, `sitemap.xml`, `llms.txt`, canonicals, JSON-LD URLs, llms links); www→apex 301 in `site/vercel.json`; three FAQ `<details>`; canon copy (eyebrow, meta description, Step 04 "Re-audit", Message Lift explainer, H1); root-docs name sweep.
3. **P1b** `src/` user-visible strings: `PRODUCT_NAME` in `src/core/constants.ts`; literal replacements (layout, login, operator shell, pipeline hints, run-creation form, export-JSON description, report service error); copy-assertion tests updated; `ui-contracts` guard test forbids `\bResonance\b` outside comments in `src/app` + `src/components`.
4. **P2a** SEO architecture: `git mv site/studies.html → site/studies/insta360.html`; `/studies` hub; `/methodology`; six `/method/*` DefinedTerm pages; index `@graph` (Organization/WebSite/WebPage/FAQPage); `robots.txt` (6 UA groups); `sitemap.xml` (10 URLs); `llms.txt`; styles additions; cache-busters `20260906b`; BRAND_SITE_GUIDE synced in the same commit.
5. **P2b** Hotel + Leica study pages, gated on the dev DB (run `cffd5856` date/model/n/scores 3.45/3.41 and the two Leica runs verified first); hub/sitemap (12)/`llms.txt` updates; absorbs the two open follow-ups from M56.
6. **P3** Contact form (gated on the operator's endpoint): plain-HTML POST form, `thanks.html` (noindex, out of sitemap), CTAs to `/#contact`, CSP `form-action` widened in the same commit as the markup, two CTA intents sitewide.
7. **P3 closeout** Gates; STATUS Done + operator handoff (Search Console + change of address, Bing, sitemap submission, `sameAs` URLs); PRD §11 Done; BUILD_NOTES S-131; PR `m57` → `main`.

## Gates

- Every phase: `pnpm lint --max-warnings 0`, `pnpm typecheck`, `pnpm docs:check` (where docs changed), plus the phase's grep acceptance from the plan handoff (§12).
- P1b and P3 closeout: full `pnpm test` (baseline 915 passed / 12 skipped, plus the new guard), `pnpm test:e2e` (18/18), `HTTPS_PROXY= HTTP_PROXY= NO_PROXY='*' pnpm build`, `git diff --check`.
- At closeout: product wall empty (`drizzle`/`package.json`/`pnpm-lock.yaml` diff vs `origin/main`); `src` diff limited to P1b files.
- `<HOST>` default `windtunnel.observer` (D-128 open-item default); a different final domain is one idempotent `set-site-domain.sh` re-run.

## Closeout

`STATUS.md` Done with evidence; `M57_BUILD_PLAN.md` stays at root as STATUS's TRACKER; M58 P0 archives it and prunes S-131 (D-025/D-126 ritual). Operator post-deploy: domain attach + old-domain 301, mailbox, Search Console + change of address, Bing Webmaster, sitemap submission, profile URLs for `sameAs`.
