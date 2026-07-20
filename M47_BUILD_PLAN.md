> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M47 execution — reachable route loading, same-segment tab/run pending feedback, redundant refresh removal · TRACKER: STATUS.md

# M47_BUILD_PLAN.md — Transition Feedback and Refresh Cleanup

> Governing decision: D-118. Product contract: `PRD.md` §8.36. Exists as D-112's branch control-plane tracker (compact; does not clear D-090's size bar).

## Objective

Fix the perceived pause: async layouts await data before any reachable boundary can render, so the previous UI stays unchanged until the new route arrives. M47 acknowledges navigation immediately. Warm-server latency investigation is a separate follow-up only if still warranted after P1/P3.

## Phases

| Phase | Scope | Acceptance |
|---|---|---|
| P0 | Archive M46, D-118, STATUS/PRD/index | `pnpm docs:check` green |
| P1 | `projects/loading.tsx` + `projects/[id]/loading.tsx` via `PageLoading` | Reachable loading on library→workspace and nested project nav |
| P2 | `LocalViewTabs` + `ReportRunSwitcher` `useTransition` + `InlineStatus`/`aria-busy` | Pending only on unmodified in-app `?view=` / `runId=` changes |
| P3 | Remove 11 duplicate `router.refresh()` after `revalidatePath` | Allowlist: login + framing-batch terminal only |
| P4 | Delayed-RSC Playwright + source contract + full gates | Presence assertions; no CI clock budget; BUILD_NOTES warm-nav sample |

## Stop lines

- No migration, new shared primitive, menu/shell refactor, cache layer, or permanent timing gate.
- Leave existing layout Suspense boundaries (client-hook hydration); they are not data-loading fallbacks.
- Do not add app-wide pending-link UI.
- Cold development compilation may still take time — M47's contract is immediate visible acknowledgment.
