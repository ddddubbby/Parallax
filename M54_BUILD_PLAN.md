> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M54 Collecting responses Overview substance trace implementation and acceptance · TRACKER: STATUS.md

# M54 — Collecting responses (Run Overview substance trace)

## Outcome

Deepen the Run Overview activity narrative with a **Collecting responses** section that shows real prompt → answer → read/score traces from persisted data. Plain operator language only. No migration; poll cadence unchanged (1.5s); Diagnostics role unchanged (D-122).

## Rulings (D-124)

1. **Overview gains Collecting responses** — substance lanes: Asking now / Just collected / Reading answers (or Scoring reactions / Reading recommendations). Status line uses outcome language.
2. **No jargon in this section** — never worker, API, job, pipeline, latency, tokens, dead letter, heartbeat. Cost/tokens stay on the existing progress block; ops events stay in Recent activity → Diagnostics.
3. **Data via `liveActivity` on `getRunDetail`** — bounded previews from jobs/prompt_cells/responses/extractions; no SSE; no schema change.
4. **Simulation truthfulness** — Message Lift shows scoring/recommendation-shaped lines only; never audit extraction UI (D-122).
5. **Hide reading lane** when the run skips secondary processing (`skipsExtraction`).

## Implementation phases

1. **Governance** — branch `m54` from `main@b49b645`; D-124; STATUS/PRD/canon index; this plan.
2. **DTO** — `liveActivity` query + core helpers (truncate, human labels, status line).
3. **UI** — `CollectingResponses` presentational component mounted in `RunProgress`.
4. **Verification** — contracts, focused repo tests, e2e visibility; lint/typecheck/docs/vitest/build/e2e gates.

## Stop lines

- No migration; no token streaming; no full raw dump on Overview.
- Do not revive Events as a peer tab.
- Do not invent in-flight rows when paused/offline/empty.

## Acceptance

- Active mock run Overview shows Collecting responses with real truncated prompt and/or answer text within a few polls.
- After secondary completes, reading/scoring lane shows a concrete human hit line.
- Status lines cover starting / in progress / paused / finished without worker/API jargon.
- Gates green; evidence in STATUS + BUILD_NOTES.
