> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: branch-local M60 progress and publication state · TRACKER: M59_BUILD_PLAN.md

# M60 status

| Field | Value |
|---|---|
| **Active product** | Windtunnel public research website |
| **Branch** | m60 from m59 (50fe5b0); m59 is published but not yet merged to main |
| **Current milestone** | M60 — Research rewritten as shareable articles: light theme, charts, flat index (D-136/D-137/D-138) |
| **Milestone state** | Code complete and locally verified; NOT deployed. Headline is provisional pending operator choice; brand logos pending (monogram chips in place) |
| **Production** | https://windtunnel.tech/research/sk-jewellery-ai-visibility-message-test |
| **Next action** | Operator picks the SK headline from `headlineCandidates` and supplies or approves logo files; then `pnpm site:research verify` + `build`, review, deploy |
| **Parked product** | GEO agent remains parked (D-116); operator product unchanged |
| **Build plan** | [M59_BUILD_PLAN.md](M59_BUILD_PLAN.md) |

M58 is merged (30dbe36, PR #18). M59 is published through the existing standalone
Vercel project, production dpl_EQgTzUQEBwod9kkYgb3PtNuvsAVC. Only site/ was uploaded.
The missing www hostname was attached; valid HTTPS and www-to-apex 301 confirmed.
No new paid study ran and verification made no database writes.

213 evidence entries verified read-only; 21 standard site tests, five publisher tests,
optional screenshot capture, lint/typecheck/docs/diff checks pass. Article mobile
Lighthouse 90/100/100/100; hub 99/100/100/100. Live URLs, cards, feed, sitemap, headers,
legacy 301s and fragment preservation verified. Evidence in docs/audits/m59/.

Search Console requires Google sign-in. User explicitly chose to leave sitemap
submission as a follow-up; do not imply submission or indexing is confirmed. Review
search queries, article impressions/clicks, available AI citations and qualified
enquiries on 18 October 2026. Prepared social copy has not been posted or emailed.

## M60 (2026-09-21)

The live site still serves the M59 article. M60 is local only: SK piece rewritten
(1,477 words, six charts, 216 evidence entries re-verified read-only), light research
theme, flat index, evidence data file with noindex header, chart PNG export. Gates:
`site:research check`, `pnpm test:research` 6/6, `pnpm test:site` 23 passed. The M59
build plan remains the TRACKER file until M60's plan is archived with it at merge.

## M61 homepage war room (2026-09-21)

Local only, on `m60`: homepage restructured per D-140 (flow, four metrics with example
charts, message test, five proven benefits, generated latest-research list, FAQ); paper
theme below the hero and on method pages; 107 unused stylesheet rules removed; scoring
pipeline and commitments moved to `/methodology`. Gates green: `site:research check`,
`test:research` 6/6, `test:site` 24 passed. Not deployed; awaiting operator preview.
Open operator items: contact address still `resonance.research@pm.me`; headline choices
and logos are in; deploy covers M60 + M61 together.
