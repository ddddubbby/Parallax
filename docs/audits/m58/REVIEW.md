# M58 review handoff

Implemented the unified Windtunnel public website redesign. The offer, original
process diagram, published evidence and contact action now form a coherent dark
system across all 13 HTML documents. No production publication has occurred.

[Protected hosting preview](https://site-104ggjjp0-franklinhou-5415s-projects.vercel.app)
requires the hosting account’s normal sign-in. Local preview: `pnpm preview:site`,
then http://127.0.0.1:8097. Design source is `site/`; review images are not deployed.

## Verification

| Gate | Result |
|---|---|
| Final site suite, including opt-in visual capture | 16 passed |
| Default site suite | 15 passed; capture is intentionally opt-in |
| Lint at zero warnings / typecheck / docs check / diff check | Passed |
| Repository unit tests | 916 passed; 12 existing skips, 125 files passed |
| Production build | Passed |
| Operator smoke | 18 passed |
| Forecast smoke | 4 passed |
| Mobile Lighthouse on local static server | 99 performance / 100 accessibility / 100 best practices / 100 SEO |
| Measured page weight | 142 KiB, under 1.5 MB |
| All-route reflow | 1440, 1280, 768, 390, 375, 320px; no global overflow |
| Accessibility | Seven representative page types; keyboard, no-JS and reduced motion checked |
| Hosted preview | Clean routes200; .html→308; missing page404; font200; required security headers |

Lighthouse is a local mobile simulation, not a production field measurement. The
initial score was81 because the external font stylesheet delayed rendering. Hosting
licensed fonts locally removed that bottleneck; the final report is `lighthouse.json`.
Its harmless local no-store/back-forward-cache observations are not production tests.

`hosting.json` records authenticated preview checks. Direct unauthenticated access
hits the account’s deployment protection. The host injects a preview feedback script;
after removing that script, the homepage exactly matches final local source.
Custom-domain www/apex and old-domain redirects remain unverified because domain
provisioning is external. Hosting config and robots groups are unchanged.

## Visual review

- [Desktop opening](home-opening-1440.png), [mobile opening](home-opening-390.png).
- [Full homepage](home-1280.png), [mobile homepage](home-390.png).
- [Studies hub](studies-1280.png), [measured evidence](measured-1280.png).
- [Simulated study](simulated-1280.png), [methodology](methodology-1280.png).
- [Metric page](metric-390.png), [social card](social-full.png), [thumbnail](social-thumbnail.png).

The corrected homepage restores the M57 report interface, four metric UI panels, full
scoring pipeline, Glass Box, seven method commitments and seven FAQs. See
[dashboard](restored-dashboard-1280.png), [metric panels](restored-metrics-1280.png),
[scoring methodology](restored-methodology-1280.png) and [method/FAQ](restored-method-1280.png).
These visuals are restored HTML/SVG product demonstrations, not raster app screenshots.

Each of the six representative page types also has captures at 1440, 1280, 768 and
390px. Reviewed hierarchy, wrapping, spacing, control consistency and table reading.
Final fixes included mobile word spacing, social UTF-8 rendering, valid hotel score
markup, local table scrolling and inline links that preserve paragraph rhythm.

## Evidence and scope reconciliation

`baseline.json` inventories original routes, fragment IDs, content and hashes.
`reconciliation.json` records final hashes, IDs, versions and preserved study values.
All published study routes and their useful anchors survive. Remaining removed IDs belong to navigation-sentinel machinery or consolidated headings; the approved
public destinations `top`, `finding`, `workflow`, `metrics`, `what-you-get`, `why-now`,
`methodology`, `method` and `contact` remain meaningful targets.

The n=25 Insta360 description study retains counts, prompt set and analyst limits.
Its n=118 audit example is separately labeled and is not pooled into that study.
Partnership experiments retain every engine, +0.15/+0.57/−0.31, n=5, directional
status and separate baselines. The hotel remains anonymous with 3.45/3.41, n=30 per
message and full conditions. No significance or equivalence claim was introduced.
No provider, operator source, database, migration, Render config or lockfile changed
relative to local M57 a27bea9d07305deb5cf0cb5e53a212e239ca6948.

## Commits and integration

| Phase | Commit |
|---|---|
| P0 baseline | 4dd6978 |
| P1 static verification | 9f338ab |
| P2 shared system | 089ffeb |
| P3 homepage | c5d47fc |
| P4 research | 5309bd8 |
| P5 assets and contracts | 2e22e3f |
| P6 verification | dcc0986 |

Remote main remains c478231a7889eff30eda884701df954d5e14c77f after the final fetch.
No remote M57 branch exists. Therefore m58 is based on local completed M57 a27bea9;
a PR against remote main includes that prerequisite work. Reconcile this before
merging. Do not silently describe M57 as already merged.

Overall status: **Code complete — unverified for custom-domain redirects and
integration**. Review the preview, reconcile M57, then decide on integration and
production publication. Keep form endpoint, mailbox, domain and search-engine setup
as separate follow-ups. Archive the M58 plan and prune its notes in the merge commit.
Rollback means redeploying the previous verified site revision.

## Upload gate

Branch m58 is committed locally. No push or PR was created. Automatic approval
review rejected the public GitHub push even after verifying the existing origin
`https://github.com/ddddubbby/Parallax` and reviewing the outgoing file list. Its
remaining reason is that the branch includes internal governance documents,
including MASTER_CONTEXT.md and PROTECTED_REGISTER.md, whose public disclosure
requires explicit user approval. Do not bypass this gate by another upload method.
The reviewable PR text is saved in PR_DESCRIPTION.md. Next action: obtain explicit
approval to push this branch, including local M57 prerequisites, governance documents
and review artifacts, to that public repository; then push and create a draft PR.
