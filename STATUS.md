> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: branch-local M58 phase state, integration and next action · TRACKER: M58_BUILD_PLAN.md

# STATUS.md — M58 control plane

| Field | Value |
|---|---|
| **Active product** | Windtunnel public brand website; no operator product behavior change |
| **Product contract** | [PRD.md](PRD.md), [BRAND_SITE_GUIDE.md](BRAND_SITE_GUIDE.md) |
| **Build plan** | [M58_BUILD_PLAN.md](M58_BUILD_PLAN.md) |
| **Branch** | m58 from local M57 a27bea9 |
| **Current milestone** | M58 — brand website redesign (D-129) |
| **Milestone state** | P0–P5 complete; P6 in progress |
| **Next action** | Complete repository checks and hosting preview review |
| **Integration target** | main; refreshed origin/main remains c478231 (M56), so M57 merge is not verified. Reconcile before integration; preserve all M57 commits |
| **Blocked on** | Production publication requires review; form endpoint and domain provisioning remain external follow-ups |
| **Pending merge** | m53 remains unmerged by operator decision |
| **Parked product** | Resonance GEO agent remains parked (D-116); AGENT_* docs unchanged |

## Phase ledger

| Phase | State |
|---|---|
| P0 — baseline and governance | Complete |
| P1 — static verification | Complete; baseline visual defects recorded |
| P2 — shared visual system | Complete |
| P3 — homepage | Complete |
| P4 — research pages | Complete |
| P5 — assets and canon | Complete |
| P6 — verification and handoff | Pending |

## Carried forward from M57

- Form endpoint not supplied; retain resonance.research@pm.me mailto. No thanks page exists.
- Buy/attach windtunnel.observer and www, configure old-domain 301 for >=12 months,
  provision mailbox, Search Console/Bing, and real sameAs profiles. Do not invent them.
- Remote merge/push/PR state needs reconciliation. M57 is complete locally except
  the explicitly deferred form; it is not verified merged or deployed.
- Future duplicate-helper and operator wording cleanup remain outside M58.
