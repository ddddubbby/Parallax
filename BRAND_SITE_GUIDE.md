> LIFECYCLE: ACTIVE · ROLE: PLAYBOOK · OWNS: public website visual, content and deployment contract

# Windtunnel website guide

The public website demonstrates technical credibility and good taste through precise
composition, readable evidence and restrained instrument details. D-129 governs its
appearance and section order. Operator and export visuals remain governed by
`DESIGN_GUIDELINES.md`; this website redesign does not restyle either.

## 1. Architecture and boundaries

The website is standalone HTML, shared CSS and vanilla JavaScript under `site/`.
No runtime dependencies, database access, provider calls or imports from `src/`.
Local verification uses `pnpm preview:site` on `http://127.0.0.1:8097` and
`pnpm test:site`, independent of the operator application.

All public HTML pages share navigation, footer, fonts and versioned assets:

- `/`: offer, featured evidence, engagement, message comparison, research and contact.
- `/studies`: independent research hub.
- `/studies/insta360`: measured descriptions and separately labeled audit example.
- `/studies/insta360-message-lift`: two independent Buyer response experiments.
- `/studies/hotel-group`: anonymized Buyer response experiment.
- `/methodology`: sampling, uncertainty, scoring boundaries and metric index.
- `/method/mention-rate`, `/method/shortlist-rate`, `/method/top-choice-rate`,
  `/method/shortlist-lift`, `/method/stability-index`, `/method/repeated-sampling`.
- `/404`: noindex error document, served with HTTP 404. No thank-you page exists.

## 2. Visual system

| Token | Value | Purpose |
|---|---|---|
| Canvas | #0B0B0D | Main reading surface |
| Panel | #141416 | Selected evidence and surface steps |
| Raised | #202022 | Controls |
| Text | #F0EEE4 | Primary type |
| Secondary | #B9B6AC | Supporting type |
| Accent | #F15A24 | Brand, actions, selection and subject series |
| Border | rgba(240,238,228,.16) | Structural hairlines |

All reading surfaces are dark. Ordinary prose remains unboxed. Depth comes from
surface steps and fine borders. No glass, glow, decorative gradients or repeating
background grids. Gradients are confined to cone shading. Signed values and explicit
language convey result direction; green/red result colors are not used.

Space Grotesk 500 carries headlines; Inter 400/600 carries prose; IBM Plex Mono
400/500 carries short metadata and tabular numbers. Latin font files are hosted locally under `site/assets/fonts/` with their OFL licenses,
`display=swap` and a display-font preload. This removes an external render-blocking request.
Sentence-case headlines have approximately 1.05 leading; prose approximately 1.6.
Reading width is about 65 characters. Avoid uppercase paragraphs.

| Role | Size |
|---|---|
| Homepage H1 | Fluid 44–88px |
| Interior H1 | Fluid 36–64px |
| Section H2 | Fluid 28–48px |
| Body | 18px desktop / 16px mobile |
| Evidence caption | At least 14px |
| Short stamp or identifier | At least 12px |

Content is capped at 1200px. Align common edges to a 12-column desktop foundation
with 24px gutters, six columns on tablet, four columns below 768px. Compositions can
span these columns asymmetrically; do not force every section into equal cards.
Outer padding is 48/32/20px; typical section spacing is 96/56px desktop/mobile.
Controls have 4px corners; panels and stamps 2px. Target areas are generally 44px.

Three signature details: segmented navigation, small registration corners on the
principal diagram and selected evidence frames, and paths connecting actual stages.
No fake logs, run identifiers, status lights, live readouts or decorative charts.

## 3. Identity and assets

The orange cone and lowercase `windtunnel` wordmark remain the identity. Preserve
cone shading and use a ring where there is enough room to read it. Keep source
assets in `public/brand/`, including historical `resonance-*` concept files. Their
historical names do not license obsolete website appearance or product naming.
`public/brand/brand-kit.html` is the current website specimen and explicitly scopes
operator/export rules separately.

`site/assets/mark.svg`, `site/favicon.svg`, `site/og.svg` and its 1200×630 rendered
`site/og.jpg` are retained production assets. The homepage process artwork is original
inline SVG, with an accessible explanation and visible labels. It shows Questions →
Repeated answers → Evidence; no numeric data is implied by its geometry.

## 4. Navigation and motion

The mark and wordmark link to `/`. Segments are How it works (`/#workflow`), Studies
(`/studies`), Method (`/methodology`), and Request a brand audit (working contact).
Mobile retains the audit action and a 44px menu button. Enter/Space opens, Escape
closes and returns focus; desktop resize restores navigation. With JavaScript
disabled, all navigation links remain visible and the inactive button is hidden.

All text is immediately visible. Buttons use a 140ms transform response; menu
feedback is immediate and may use opacity/transform for at most 220ms. No entrance
observers, scrambling, parallax, continuous motion or scroll-gated content.

```css
.btn { transition: transform 140ms cubic-bezier(.22,1,.36,1); }
.btn:hover { transform: translateY(-2px); }
.btn:active { transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

## 5. Homepage blueprint

1. **Opening, `#top`.** Title: “Windtunnel · AI visibility audits and message testing”. H1: “Measure how AI recommends your brand. Test which message moves you up its shortlist.” (D-131; the social card keeps “Your brand, through AI’s eyes.” as its image line and og:title). Supporting copy:
   “We measure how AI describes and recommends your brand, then test your current
   message against a new one under the same conditions. You get the evidence, the
   comparison, and the limits.” Request a brand audit and Explore the studies.
   Asymmetric text and static instrument illustration labeled How an audit works.
2. **Featured evidence, `#finding`.** “The newest story appeared in 0 of 25 answers.”
   Insta360, DeepSeek, ungrounded, 11 Jul 2026, five prompts × five repetitions,
   single analyst, directional; independent and not a client. Link to full evidence.
3. **Engagement, `#workflow`.** Discover relevant questions → audit repeated answers
   → inspect the evidence report → test a candidate message → re-audit later.
   Measurement and simulation are visibly distinct; re-audit is a later engagement.
   `#why-now` explains the engagement context. `#metrics` contains Presence,
   Position, Perception and Proof as four concise client questions.
4. **Message testing, `#what-you-get`.** “Shared contexts. Only the message changes.”
   AI recommendation and Buyer response are explained separately. Current/New have
   equal visual weight. Hotel example: 3.45 / 3.41; simulated, n=30 per message,
   DeepSeek, ungrounded, 31 Jul 2026, anonymous and independent. No significance or
   equivalence claim. Do not label Buyer response as Shortlist lift.
5. **Research, `#methodology` and `#method`.** Three studies, repeated sampling,
   traceability, uncertainty and limits. Native FAQ covers what is measured,
   Message Lift, prompt repetition and API/consumer-chat differences.
6. **Contact, `#contact`.** “Find out where your brand stands.” Category, competitors
   or candidate message invitation, working email, shared footer and wordmark.

Preserve every fragment above on a meaningful element with sticky-header offsets.
The homepage also retains a full report/dashboard showcase (`#dashboard`), four
metric UI panels (`#metrics`), the complete five-stage Buyer response scoring diagram
and distinct AI recommendation explanation (`#methodology`), Glass Box, seven method
commitments and the full FAQ (`#method`). D-130 supersedes the earlier removal of
these sections. The M57 product visuals are rendered HTML/SVG; do not mislabel them
as literal application screenshots. Illustrative figures retain their labels.
Restyle substantive content; do not remove it as an aesthetic shortcut.

## 6. Research and claims

Study order: finding, conditions and material limits, main evidence, prompts and
method, interpretation and remaining limits, related research and contact.
Useful existing fragments, verbatim quotes, source references and values survive.
The hub features the measured study, with separate entries for each simulated study.

Every figure retains population, date, route/mode and status. Preserve all three
partnership shifts (+0.15, +0.57, −0.31), each engine, n=5 and directional status.
These experiments have separate baselines, not a head-to-head. Never recompute shifts
from rounded means. The hotel stays anonymous in text, metadata and alt text.
“No lift” does not establish significance or equivalence.

The mention-rate example is a separate 19 Jul 2026 audit, n=118, OpenAI + DeepSeek,
ungrounded. It is never pooled with the 25-answer descriptive study. Recurrence is
not a confidence interval or Stability Index. Simulation is never a human outcome,
sales forecast, purchase probability or ranking guarantee. Independent studies must
not imply client relationships. Claims law in `BRAND_PLAYBOOK.md` §5 remains binding.

Definitions retain formulas, eligible populations, exclusions, uncertainty and
examples. Buyer response scoring and AI recommendation parsing stay distinct.
Tables use aligned numeric headers/cells and labeled, keyboard-focusable local
scrolling where necessary. Captions and limitations stay comfortably readable.

## 7. Metadata and hosting

Each HTML page has its own title/description, canonical, Open Graph and Twitter
metadata. JSON-LD retains identities: Organization/WebSite/WebPage/FAQPage on home,
CollectionPage/ItemList on hub, Article on studies, TechArticle/DefinedTermSet on
methodology, DefinedTerm/WebPage on definitions. FAQ/definition text must match the
visible content. Never invent sameAs profiles. `llms.txt` describes the current offer
and links every research/definition page with accurate evidence status.

Every changed public page gets a sitemap lastmod update. 404 and any future thank-you
page remain excluded. CSS/JS cache versions match across every HTML document.

Hosting target remains a standalone Vercel project with Root Directory `site`.
`site/vercel.json` owns clean URLs, redirects, CSP/security headers and cache tiers.
`site/_headers` is retained for host portability and is inert on Vercel.
`site/.vercel/` is ignored operator configuration. No connection to `render.yaml`.

The configured canonical host is `https://windtunnel.observer`; actual domain and
publication verification lives in STATUS, not an assumed deployment claim here.
`scripts/set-site-domain.sh <url>` stamps or re-stamps HTML, robots, sitemap and
llms URLs idempotently. Preserve its compatibility and all explicit robots groups.
Old-domain redirects require hosting configuration. Contact provisioning remains
external; retain the working mailto until a real endpoint/mailbox is available.

## 8. Verification and publication

Run `pnpm test:site`, lint at zero warnings, typecheck, docs:check and git diff --check,
plus required repository CI checks. The static preview server serves only `site/`
on loopback8097, supports extensionless HTML/query strings, serves missing routes
with the 404 document/status, and rejects traversal. It does not verify host headers.

Review 1440, 1280, 768 and 390px plus 375/320px overflow. Check keyboard navigation,
Escape/focus/resize, skip link, headings, native disclosures, no-JS, reduced motion,
all routes, table scroll, console and assets. Save screenshots outside deployed site,
under `docs/audits/m58/`. For the reproducible visual capture test, run
`M58_CAPTURE=1 pnpm test:site --grep 'capture review artifacts'`.

Target mobile Lighthouse ≥90 in performance, accessibility, best practices and SEO;
page weight ≤1.5MB. Record actual measurements and limitations. Verify extensionless
routes, headers and redirects on an available hosting preview separately. Show the
preview/screenshots before production publication. Missing required verification is
“Code complete — unverified,” never a passed gate. Rollback redeploys the previous
verified revision. Milestone merge archives the plan and prunes its session notes.
