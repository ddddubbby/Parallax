> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: branch-local M58 phase state, integration and next action · TRACKER: M58_BUILD_PLAN.md

# STATUS.md — M58 control plane

| Field | Value |
|---|---|
| **Active product** | Windtunnel public brand website; no operator product behavior change |
| **Product contract** | [PRD.md](PRD.md), [BRAND_SITE_GUIDE.md](BRAND_SITE_GUIDE.md) |
| **Build plan** | [M58_BUILD_PLAN.md](M58_BUILD_PLAN.md) |
| **Branch** | m58 from local M57 a27bea9 |
| **Current milestone** | M58 — brand website redesign (D-129) |
| **Milestone state** | Content restored and locally verified (D-130); corrected visual review pending |
| **Next action** | Review corrected preview with restored product UI and methodology; public push approval remains separate |
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
| P6 — verification and handoff | Local and preview gates passed; integration/domain follow-ups open |

## Carried forward from M57

- Form endpoint not supplied; retain resonance.research@pm.me mailto. No thanks page exists.
- Buy/attach windtunnel.observer and www, configure old-domain 301 for >=12 months,
  provision mailbox, Search Console/Bing, and real sameAs profiles. Do not invent them.
- Remote merge/push/PR state needs reconciliation. M57 is complete locally except
  the explicitly deferred form; it is not verified merged or deployed.
- Future duplicate-helper and operator wording cleanup remain outside M58.

## M58 review

Preview: https://site-104ggjjp0-franklinhou-5415s-projects.vercel.app
(account sign-in required). Production was not published.

Verified: 16 site checks including visual capture; lint/typecheck/docs/diff clean;
916 unit tests (12 existing skips), 18 operator smoke tests, 4 forecast tests, and
production build. Mobile Lighthouse: 99 performance, 100 accessibility, 100 best
practices, 100 SEO; 142 KiB measured page weight. See
[verification report](docs/audits/m58/REVIEW.md) for scope, images and limitations.

Custom-domain www/apex redirects, old-domain transfer, mailbox/form/search setup and
remote M57 integration remain external. The preview has verified clean HTML URLs,
404 behavior, font delivery and security headers. The existing hosting config and
robots groups are unchanged.

## Public upload approval gate

Local implementation/verification commit: `dcc0986`. Public push and PR are not done.
Automatic approval review rejected `git push -u origin m58`: although the existing
origin is verified as public ddddubbby/Parallax, the branch includes governance docs
(MASTER_CONTEXT.md and PROTECTED_REGISTER.md) whose public disclosure was not
specifically approved. It includes the disclosed local M57 prerequisites too.
[Draft PR description](docs/audits/m58/PR_DESCRIPTION.md) is ready locally. Ask for
explicit approval for that exact upload; do not use an alternative upload path.
