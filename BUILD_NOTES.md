# BUILD_NOTES.md - Session Working Memory

> Disposable mid-milestone state for agent handoff. This file answers "what was the last session doing?" — nothing else. Durable facts do not live here: decisions go to the `MASTER_CONTEXT.md` Decision Log, status goes to the `PRD.md` tracker, schema/contract facts go to the spec docs.

## Rules

1. **Append one entry per session**, as step one of the handoff ritual — or immediately whenever stopping mid-task or blocked.
2. **Disposable:** when a milestone merges, delete its entries. Anything still worth keeping must graduate to a canonical doc first; if it can't, it wasn't worth keeping.
3. **No restating:** never duplicate what a commit message, the PRD tracker, or the Decision Log already says. The unique value here is dead ends, unverified work, and the exact next action.

## Template

```
## S-<NNN> / <YYYY-MM-DD> / M<N>
GOAL: <one line: what this session set out to do>
DONE: <verified work, each with the command or check that proved it>
UNVERIFIED: <built but not yet proven; say what proof is missing>
REJECTED: <approach tried and abandoned + why, one line each>
NEXT: <the exact first action for the next session — command or file-level>
GOTCHAS: <environment quirks, surprising behavior, anything that cost >10 minutes>
```

Session numbers increment forever and never reset; omit empty fields except NEXT, which is mandatory.

---

## Entries

## S-001 / 2026-07-02 / M0
GOAL: Finalize the documentation layer before production build starts.
DONE: Three review passes complete; D-011 through D-025 resolved and logged; credential model, design language, Render contract, and this file wired into the doc system. Verified by cross-doc grep and commits `b36bd6e`, `c3dfff0`.
NEXT: Start the M0 scaffold — `package.json` (with `packageManager` pin), `.node-version`, Next/Vitest/Drizzle configs, `/health` route, CI workflow, per `RENDER_DEPLOYMENT.md` prerequisites. Boot ritual applies: plan and confirm before editing.
GOTCHAS: No dependencies installed yet; nothing runs. Drizzle config must pin `out` to `src/db/migrations` (see ENGINEERING_SPEC section 2).
