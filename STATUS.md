> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: mainline product and site publication status · TRACKER: M59_BUILD_PLAN.md

# Mainline status

| Field | Value |
|---|---|
| **Active product** | Windtunnel operator app (M63); public research website unchanged |
| **Branch** | `main` at `c779d60` (M63 merged via PR #22) |
| **Current milestone** | M63 — Shopping-agent model engines: Grok and Muse Spark (D-143–D-145) |
| **Milestone state** | M63 concluded (D-143–D-145): Muse Spark verified live, Grok code complete but unverified (no key); merged to `main` via PR #22 on 2026-09-30; migrations 0024 and 0025 applied to the dev DB only. M60/M61 published 2026-09-24 |
| **Production** | https://windtunnel.tech/research/sk-jewellery-ai-visibility-message-test |
| **Next action** | Run `pnpm db:migrate` on production (0024 and 0025 pending there) and confirm no Render `WORKER_PROVIDER_TIMEOUT_MS`/`WORKER_STALE_LOCK_MS` override pins the old 120s deadline. Then a real Muse Spark live validation run (grounded, k=2, cap ~$10); add an xAI key and Verify Grok. Site: confirm `research@windtunnel.tech` routing; review search performance on 2026-10-18 |
| **Parked product** | None — the GEO agent was retired in M62 (D-141) |
| **Build plan** | [M59_BUILD_PLAN.md](M59_BUILD_PLAN.md) |

M58 is merged (30dbe36, PR #18). M59 was merged with M60 in PR #19. M60/M61 were
published from `site/` to the existing standalone Vercel project as production
deployment `dpl_26zGcktwCHrDhkGRXNPauyiAdepp`; `windtunnel.tech` and `www` are aliased.
The contact address was published as selected by the operator; mailbox delivery remains
unverified. No new paid study ran and the evidence receipts were not regenerated.

213 evidence entries verified read-only; 21 standard site tests, five publisher tests,
optional screenshot capture, lint/typecheck/docs/diff checks pass. Article mobile
Lighthouse 90/100/100/100; hub 99/100/100/100. Live URLs, cards, feed, sitemap, headers,
legacy 301s and fragment preservation verified. Evidence in docs/audits/m59/.

Search Console requires Google sign-in. User explicitly chose to leave sitemap
submission as a follow-up; do not imply submission or indexing is confirmed. Review
search queries, article impressions/clicks, available AI citations and qualified
enquiries on 18 October 2026. Prepared social copy has not been posted or emailed.

## M60 (2026-09-21; published 2026-09-24)

SK research article rewritten with six charts and 216 evidence entries, light research
theme, flat index, noindex evidence file, and chart PNGs. The verified receipt's content
hash and 216-source count match. Current local Postgres was unavailable for a fresh
read-only recheck; `site:research check` and the full publisher/site checks pass.

## M61 homepage (2026-09-21; published 2026-09-24)

Homepage restructured per D-140 (flow, four metrics with example
charts, message test, five proven benefits, generated latest-research list, FAQ); paper
theme below the hero and on method pages; 107 unused stylesheet rules removed; scoring
pipeline and commitments moved to `/methodology`. Headline choices and official brand
logos are in. The contact address is `research@windtunnel.tech`; delivery is unverified.
Published with M60 after preview review.

## M62 GEO agent retirement (2026-09-24)

Merged on main in PR #20 per D-141. Agent code, route, dependency and tables removed;
migration 0024 drops the `agent_*` tables. Gates green: `pnpm typecheck`, `pnpm lint
--max-warnings 0`, `pnpm test` (684 passed, including the upgrade-path check that the
agent tables are gone and `service_heartbeats` survives), `pnpm docs:check`. Migration
0024 was applied to the dev database on 2026-09-29 by M63's `pnpm db:migrate`; production
is still unapplied.

## M63 shopping-agent model engines (2026-09-29)

Merged to `main` via PR #22 (2026-09-30), per D-143. Grok 4.7 (`xai`) and Muse Spark 1.3 (`meta`)
adapters on the Responses API with `web_search` grounding; migration 0025 adds `meta`
to `provider_id`. Wired into Settings (keys, Verify, defaults) and run creation, where
both appear as providers marked "missing" until a key is saved. Gates green: typecheck,
lint, `pnpm test` (694 passed), `pnpm docs:check`. No live call has been made: citation
shape and billed cost are confirmed only by the first validation run.
Same day, D-145: 240s call deadline for every engine, realistic grounded estimates, retrieved
sources; 12/12 grounded Muse Spark calls passed at 240s (29–46s each). D-144: every engine now runs at low reasoning effort, stamped on stored model
versions; Muse Spark Verify dropped from 50s to 25s. Operator key saved and verified for Meta.
