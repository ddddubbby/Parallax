# M56 doc drift matrix (disposable at close)

Class: CS = current-state (update in place) · AO = append-only (truncate only) · PL = plan (archive with header).

| Doc | Class | Anchor | Stale claim | Correct claim / source | Phase |
|---|---|---|---|---|---|
| BRAND_PLAYBOOK.md | CS | §1.1–1.4, §3, §4, §5 r2/r3, §5.4, §6.1–6.2, §8, §9, §10.2, §11 | "synthetic consumer research", "We are not a GEO tool", ΔPI-ranked studies, pilot-only proof library, stale H1/CTAs | D-127; live site 2026-09-02 | P2 |
| BRAND_SITE_GUIDE.md | CS | L10, §0, §1.2, §6, §7, §9, §11 | "proposal", investors audience, single page, Render Static Site, wave.svg/bezel.png | D-127; `site/` tree; Vercel | P2 |
| README.md | CS | L21, L28, L56–67 | "Five providers"; Decision Log in MASTER_CONTEXT §9; scripts list incomplete | six registered ids / five live + mock (xai metadata-only); DECISIONS.md (D-107); package.json | P2 |
| MASTER_CONTEXT.md | CS | §1 L21/L23, §3 L35/L41, §5, §6, §7 L115 + index, §12 | Simulation Layer as primary; MiniMax candidate; incomplete command table/repo map; false docs:check claim; ACTIVE plans for merged milestones; five intents | D-119; D-106/D-116 (xai); package.json; `scripts/docs-check.ts`; `src/core/matrix.ts` | P2/P3 |
| PRD.md | CS | L1 header, L5, §1, §2, §4, §5, §6, §7, §8.20–8.22, §10, §11, §12 | M55 "DONE ON m55"; Simulation Layer naming; five intents; monitoring/Grok scope; missing routes; RS-1/RS-4/RS-8 pre-D-119; pending-merge tracker rows | D-119, D-125, git merges #8/#10–#16; `ls src/app` | P2/P3 |
| DEVELOPMENT_GUIDELINES.md | CS | C2 L91–98, L189–195, §F, L357, §D L232/L235 | ProviderId with minimax/no xai; five intents; acceptance list ends at M40; log pointer; two constants deleted in P4 | `src/providers/types.ts`; `src/core/matrix.ts`; D-107 | P2/P4 |
| ENGINEERING_SPEC.md | CS | L1, L5, §1 L54, §2, §3, L143 | OWNS "acceptance commands"; D-102 state machine current; migrations stop at 0015; no xai row | D-114; `src/db/migrations/`; D-106 | P2 |
| DESIGN_GUIDELINES.md | CS | L19 | SIMULATION LAYER chip described as live | dormant string, `funnel.ts` lower unreachable | P2 |
| RELEASE_CHECKLIST.md | CS | L67, L81–82, Part 1 | "Resonance study"; retro in MASTER_CONTEXT; no docs:check gate | D-119; D-107; CI | P2 |
| RENDER_DEPLOYMENT.md | CS | L5; missing section | "Parallax deploys"; site deployment undocumented | D-119 naming; Vercel/resonance.observer (D-127) | P2 |
| AGENT_PRD/BUILD_PLAN/STRATEGY_MEMO.md | CS header | L1 | LIFECYCLE ACTIVE | PARKED (D-116) | P2 |
| STATUS.md | CS | all | M55 ready for PR | M56 control plane | P0 |
| BUILD_NOTES.md | AO + preamble | L5, rule 4, merged-milestone entries | Decision Log pointer; S-number collisions unaddressed; merged entries not truncated | D-107; D-025; D-126 | P2/P3 |
| M43/M47/M49/M50/M51/M52/M54/M55_BUILD_PLAN.md | PL | L1 | ACTIVE at root | HISTORICAL · EXECUTED in docs/history (D-126) | P3 |
