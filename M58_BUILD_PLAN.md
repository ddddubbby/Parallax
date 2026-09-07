> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M58 public website redesign, phase gates and handoff · TRACKER: STATUS.md

# M58 — Windtunnel brand website redesign

## Design brief

Create a refined cyberpunk terminal aesthetic: dark matte surfaces, precise alignment,
confident typography, restrained instrument details and one orange signal accent.
Every public page must feel like one coherent product. Change density and composition
for the reader's task, not the underlying identity.

Visitors should understand that Windtunnel measures AI brand descriptions and
recommendations, tests messages under controlled conditions, provides inspectable
evidence with limits, and offers a brand audit as the next step.

Scope: public HTML, shared CSS/JS, original SVG diagram, social card, brand specimen,
documentation and website tests. No operator restyling, database access, new research,
provider changes, pricing, analytics or contact-form provisioning. No migration or
new dependency. Keep static HTML/CSS/vanilla JS.

## Baseline and integration

Base: `a27bea9` (local M57 tip). On 2026-09-07, both `git fetch origin` and
`git ls-remote origin refs/heads/main refs/heads/m57` reported origin/main at
`c478231` and no remote M57 branch. The requested merged-M57 base cannot be verified.
Preserve the complete local M57 work, branch m58 from it, compare the M58 scope wall
against a27bea9, and reconcile trunk before PR integration. Do not claim M57 merged.
The M57 plan is archived as superseded, with its body unchanged. Its form, domain,
mailbox, profile and search-engine follow-ups remain tracked in STATUS.

## Fixed visual contract

- Canvas #0B0B0D; panel #141416; raised control #202022; primary text #F0EEE4;
  secondary #B9B6AC; accent #F15A24; warm-white hairlines at 16% opacity.
- Declare colors, radii, spacing and timing as shared CSS tokens. All reading
  surfaces stay dark. Use single hairlines and surface steps, not nested boxes.
- Orange means brand, action, selection or subject series, never favorable result.
  Signed values and explicit wording distinguish result direction. Preserve cone
  shading; no decorative gradients, glows or glass.
- Space Grotesk headlines, Inter prose, IBM Plex Mono short labels and numbers.
  H1 homepage 44–88px, interior 36–64px; H2 28–48px; body 18/16px; captions >=14px;
  short labels/stamps >=12px. Leading approximately 1.05 headings, 1.6 prose.
- 1200px maximum content; 12-column desktop, six-column tablet, four-column mobile
  below 768px; 24px gutters; outer padding 48/32/20px; section gaps 96/56px.
- 4px controls, 2px panels/stamps; generally >=44px targets. Shared aligned edges.
- Signature details: segmented navigation, registration corners on the principal
  diagram and selected evidence, signal paths between meaningful process stages.
- Keep cone and lowercase wordmark. No invented logs, run IDs, live status, code
  tickers, fake charts or random technical labels.
- Text visible immediately. Feedback 140ms, menu 220ms. Transform/opacity only.
  No recurring animation, text scrambling, parallax or scroll-gated reading.
  Reduced motion and JavaScript-disabled access are complete. Diagram is static.

## Phase execution

### P0 — Milestone and baseline

1. Read boot docs, brand claims and protected register. Inspect tree and remote.
2. Establish m58 from the complete baseline above; preserve unrelated work.
3. Create this plan; archive M57 body unchanged with superseded disposition.
4. Carry M57 external follow-ups forward before pruning notes.
5. Update STATUS, PRD milestone table, MASTER_CONTEXT index, D-129 and its narrow
   D-128 supersession edge. Scope DESIGN_GUIDELINES to operator/export rules.
6. Inventory pages, URLs/fragments, links, study figures, provenance, disclosures,
   metadata and cache versions; save baseline renders under docs/audits/m58.
Gate: control docs agree, baseline truth recorded, docs:check and diff check pass.
Commit: M58 P0: establish website redesign contract and baseline.

### P1 — Independent static verification

1. Add dedicated Playwright config and tests outside operator e2e, using .pw.ts.
2. Add Node built-in static server, loopback :8097, restricted to site directory.
3. Serve root/assets and clean HTML URLs; strip query strings, reject traversal
   and escaped symlinks; missing paths serve site 404 with status 404.
4. Add test:site; retain app tests. Cover routes, links/fragments, IDs/H1, versions,
   metadata, evidence values and labels, keyboard/menu, no-JS and reduced motion.
5. Use installed axe tooling. Baseline defects must be recorded, not hidden.
Gate: no app/DB/worker started; route/server checks green; discovery isolated.
Commit: M58 P1: add isolated website verification.

### P2 — Shared visual system

1. Replace obsolete CSS with token-based foundation, typography, grids, panels,
   evidence/table/disclosure styles. Do not stack another override theme.
2. Segmented header: How it works /#workflow; Studies /studies; Method /methodology;
   Request a brand audit uses the working mailto/form destination. Logo links /.
3. Mobile: visible audit CTA, keyboard-operable toggle, Escape/focus return and
   resize recovery. No-JS shows links and hides inert toggle.
4. Remove content-reveal observer and hidden initial styles. Apply shared header,
   footer and style foundation to every page; check protected assets before removal.
5. Update brand specimen; preserve concept sources and scope operator specimens.
6. Bump stylesheet/script versions on every page.
Gate: consistent dark foundation, readable immediate content, representative
keyboard/contrast/responsive checks and mechanical gates.
Commit: M58 P2: establish unified terminal visual system.

### P3 — Homepage

1. Opening H1: “Your brand, through AI’s eyes.” (superseded by D-131: the D-128 measure/test/shortlist H1 and a category-anchored title are restored; the line survives on the social card and og:title). Supporting text: “We measure how
   AI describes and recommends your brand, then test your current message against
   a new one under the same conditions. You get the evidence, the comparison,
   and the limits.” CTAs: Request a brand audit / Explore the studies.
2. Asymmetric text + original conceptual diagram: Questions → Repeated answers →
   Evidence. Cone is identity marker. Label “How an audit works.” No invented data.
3. Feature “The newest story appeared in 0 of 25 answers.” Tie to Insta360's
   direct-to-share finding, 11 Jul 2026, DeepSeek, ungrounded, single analyst,
   directional descriptive observation, independent/not-client; link full study.
4. Engagement: discover questions → audit repeated answers → inspect evidence →
   test candidate → re-audit later. Mark measurement and simulation distinctly.
   Integrate four pillar questions. Recompose vertically on mobile.
5. Message Lift: Current/New equal prominence, “Shared contexts. Only the message
   changes.” AI recommendation and Buyer response explained separately.
6. Hotel example: Current 3.45/New 3.41, SIMULATED, n=30 per message, 31 Jul 2026,
   DeepSeek ungrounded, independent/not-client. No Shortlist lift relabel or
   significance/equivalence claim. Keep hotel anonymous everywhere.
7. Link all three studies. Trust summary: repeated samples, traceability,
   uncertainty, limits. Native FAQ: measurement, Message Lift, repetitions,
   API vs consumer chat. Keep the full scoring explanation on the homepage and link deeper methodology.
8. Contact: “Find out where your brand stands.” Invite category/competitors/message,
   retain contact behavior and shared footer.
9. Preserve and restyle the report/dashboard showcase, metric UI panels and full scoring methodology. Simplify decorative framing and duplicate
   explanations. Keep anchors: top/opening, finding/evidence, workflow/process,
   metrics/pillars, what-you-get/testing, why-now/context, methodology+method/trust,
   contact/contact. Place meaningful visible targets with header offsets.
Gate: clear offer/focal point, all disclosures and anchors, mobile/desktop renders,
site tests and mechanical checks.
Commit: M58 P3: rebuild homepage around offer and evidence.

### P4 — Research pages

1. Hub: lead independent research, feature description study, separate two test
   entries, readable mode/date/n/disclosure, deliberate hierarchy.
2. Study order: finding → context/limits → evidence → prompts/method → interpretation
   and remaining limits → related research/CTA. Preserve published tables, quotes,
   provenance and sources; no silent omissions.
3. Partnership page: separate baselines, not head-to-head; every engine; n=5 and
   directional labels; preserve +0.15/+0.57/−0.31, never derive from rounded means.
4. Hotel: preserve anonymity, scores/conditions and bounded conclusion.
5. Method pages: plain definition first; preserve formulas, exclusions, uncertainty,
   examples; distinguish Buyer response from AI recommendation/Shortlist lift.
6. Relocate useful homepage detail. Full evidence-width tables, numeric alignment,
   labeled keyboard-scroll regions where required. Style 404/existing thanks too.
Gate: inventory reconciles, routes work, consistent readable identity, tests pass.
Commit: M58 P4: unify research and methodology pages.

### P5 — Assets and canon

1. Rewrite site guide to match new system and blueprint; remove stale paper-stage,
   float, zoom, reveal prescriptions. Update playbook site references, keep claims law.
2. Keep operator and report visual rules scoped and unchanged.
3. Rebuild 1200×630 social card with headline/cone/dark system; preserve source.
4. Sync titles/descriptions/OG/Twitter; visible FAQ/definitions match JSON-LD.
5. Preserve canonicals, schema IDs, robots groups, stamping and hosting headers.
6. Update changed sitemap dates; never include 404/thanks. Sync llms and versions.
Gate: metadata parses/matches, no stale tokens, social thumbnail reviewed, docs pass.
Commit: M58 P5: synchronize brand assets and site contracts.

### P6 — Verification and handoff

1. Run pnpm test:site, lint --max-warnings 0, typecheck, docs:check, diff --check,
   plus required repository CI checks. No unintended src/drizzle/lockfile diff.
2. Review 1440/1280/768/390px; 375/320 overflow; all links, keyboard/menu/focus,
   no-JS, reduced motion, tables, missing assets/console, consistency.
3. Capture homepage, hub, measured study, simulated study, methodology and metric.
   Compare clarity, identity, cohesion, hierarchy, useful technical detail, evidence
   readability against baseline. Fix systemic problems first.
4. Target mobile Lighthouse >=90 in each category and <=1.5MB per page. Report
   tooling limits honestly. Preview hosting checks separately from local server.
5. Update STATUS and notes with commits, exact checks/screenshots, limitations and
   next action. Unverified gates mean “Code complete — unverified,” not Done.
6. Prepare reviewable branch/PR; present preview/screenshots before publication.
   Reconcile M57/trunk discrepancy before integration. No production deploy here.
7. Rollback is previous verified site revision, no data rollback. Follow archival
   convention at milestone merge; preserve pending operator prerequisites.
Commit: M58 P6: verify website redesign and complete handoff.

## Handoff discipline

At each green phase: inspect, test, commit explicit paths, update status/notes and
continue. Never git add -A. Durable visual rules belong in BRAND_SITE_GUIDE; runtime
state belongs in STATUS; this plan owns sequence and acceptance. No further visual
choice is needed: improve spacing/wrapping within the settled coherent dark system.

## Content restoration correction (D-130)

The first implementation removed substantive product demonstration and methodology
content. The user rejected that loss. Restore the M57 report interface, four metric
panels, full scoring diagram, Glass Box, method commitments and full FAQ on the
homepage. Redesign presentation without deleting content that explains or proves
the product. Preserve illustrative labels and real-study disclosures. M57 stores
these UI visuals as HTML/SVG, not separate screenshot image files.
