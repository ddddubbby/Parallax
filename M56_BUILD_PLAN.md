> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M56 whole-repo cleanup pass — docs drift, repo noise, plan archival, zero-reference exports (D-126/D-127) · TRACKER: STATUS.md

# M56 — Whole-Repo Cleanup Pass

## Outcome

No current-state document contains a stale claim; every untracked file has a recorded owner decision; every `Delete` has register proof; the eight merged milestone plans are archived; the brand canon says what the live site says; the test, lint, typecheck, docs, build, and e2e gates are unchanged.

## Scope walls

- Docs drift + repo noise + zero-reference exports only. No duplicate-logic merges, no UI vocabulary change under `src/`, no behavior change, no migration.
- `PROTECTED_REGISTER.md` match ⇒ Keep — Protected. D-116 (agent docs, code, branches, BUILD_NOTES entries), D-114 (retired framing surfaces), D-099 (v4 artifacts), D-082/D-066 (fixtures) are never touched.
- Append-only history is truncated (D-025), never rewritten. Migrations untouched. Never `git add -A`.
- Branch `m53` stays unmerged (operator decision); `m35`–`m40`/`geo-agent-v1` stay (D-116).

## Phases

1. **P-1** Merge `m54` into `main` (site source, playbook claim rows, `set-site-domain.sh`); cut `m56`.
2. **P0** D-126/D-127, STATUS, this plan, PROTECTED_REGISTER M56 section, `docs/audits/m56/` register + drift matrix, baseline gates.
3. **P1** Repo noise: `git worktree prune`, remove the `strange-carson` worktree and branch, delete `chore/purge-apple-design-skill`, remove the upload zip, `.pnpm-store-link/`, `public/.gitkeep`; add `EMBEDDING_PROVIDER` / `OPENAI_EMBEDDING_MODEL` names to `.env.example`.
4. **P2** Brand canon rewritten in place (D-127), then README, MASTER_CONTEXT, PRD, DEVELOPMENT_GUIDELINES, ENGINEERING_SPEC, DESIGN_GUIDELINES, RELEASE_CHECKLIST, RENDER_DEPLOYMENT, AGENT_* headers, BUILD_NOTES preamble.
5. **P3** Archive M43/M47/M49/M50/M51/M52/M54/M55 plans to `docs/history/` (headers only; bodies byte-frozen); D-025 truncation of merged-milestone BUILD_NOTES entries after their durable facts graduated.
6. **P4** Delete zero-reference exports DC-01..DC-24 with the targeted tests in the register.
7. **P5** Closeout: delete `docs/audits/m56/`, final STATUS, PRD §11 row, gates.

## Gates

- Every phase: `pnpm lint --max-warnings 0`, `pnpm typecheck`, `pnpm docs:check`.
- P2/P3: grep gates G1–G8, G10–G12 (listed in `docs/audits/m56/AUDIT_REGISTER.md`); forbidden-phrase suites.
- P4: targeted vitest files per DC row, full `pnpm test` (expected unchanged counts), `pnpm test:e2e`, G9.
- P5: `pnpm build` (no dev server on :3000, D-075), `pnpm test:e2e:forecast`, `git diff --check`.

## Working artifacts

`docs/audits/m56/AUDIT_REGISTER.md`, `docs/audits/m56/DOC_DRIFT_MATRIX.md` — disposable at close (AUDIT_METHODOLOGY §8).

## Closeout

`M56_BUILD_PLAN.md` stays at root as STATUS's TRACKER (the only ACTIVE PLAN once `AGENT_BUILD_PLAN.md` reads PARKED); M57 P0 archives it and prunes S-130.. (D-126).
