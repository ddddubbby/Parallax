> LIFECYCLE: ACTIVE · ROLE: PLAYBOOK · OWNS: Windtunnel site structure and copy guide (active brand under D-106)

# BRAND_SITE_GUIDE.md — The Windtunnel Brand Website

> The execution guide for the public Windtunnel brand/marketing website.
> Written to be executed by a coding agent with no prior context. Read top to bottom
> once, then follow section 10 (maintenance order) step by step. Every ambiguous
> decision has already been made for you; do not improvise where this guide is
> specific.
>
> STATUS: adopted and live (D-127). The site is deployed on Vercel at
> `https://windtunnel.observer` from the `site/` folder; the live site is the
> external source of truth for structure and copy, and this guide is kept in
> step with it. The website is a STANDALONE artifact. It must not import from,
> link into, or be served by the operator app in `/src`. It never touches the
> database, providers, or any app code.

---

## 0. Design read (what you are building and why it looks this way)

**One-line design read:** a precision instrument brand telling a "signal in the
noise" story: dark instrument-stage sections where grayscale geometry drifts in
slow motion, alternating with cream evidence-dossier sections where the numbers
live; one orange signal — the cone — is the only colored object in the world.

**Audience:** potential clients (brand and marketing leads, founders, agency
and PR strategists buying a brand audit or a Message Lift test). They want:
what is this, does it work, is it rigorous, who is behind it. Nobody wants
hype. There is no investor section on the site.

**The concept.** Windtunnel measures how AI assistants rank, describe, and
substantiate brands, then runs Message Lift tests (one Current message, one
New message, shared contexts) to find which message moves a brand up the AI's
shortlist. The site dramatizes exactly that:

- The **Stage** (near-black sections): the AI landscape. Anonymous grayscale
  3D primitives float and slowly rotate — these are "all the brands, as AI sees
  them." Undifferentiated. Interchangeable.
- The **Signal** (the orange cone): the one shape that resonates — the client's
  brand once it is measured and its message tested. The cone is the ONLY
  saturated object anywhere on the site. Orange never appears on anything else
  except interactive accents (CTA, links, the wave motif).
- The **Dossier** (cream sections): where evidence lives. Numbers, method,
  case studies. Calm paper, ink text, mono stamps — the visual language of the
  Windtunnel product itself, so the site and the tool feel like one instrument.

**Why this is honest branding, not decoration:** Windtunnel's differentiator is
statistical honesty (confidence intervals, sample gates, a hard wall between
measured and simulated data). The site must *feel* like an instrument, not an
agency hype page. Every design choice below serves that.

---

## 1. Ground rules (read before writing any code)

1. **Standalone static site.** Plain HTML + CSS + vanilla JS. No React, no
   build step, no npm dependencies, no CDN JS libraries (the CSP in
   `site/vercel.json` blocks them anyway). Every HTML page under `site/`
   (currently `index.html`, `studies.html`, `404.html`), one `styles.css`, one
   `motion.js`, plus assets. Charts are CSS meters and inline SVG driven by `--value` custom
   properties, never a charting library. Rationale: zero-dependency sites
   cannot rot, and this guide's motion specs are all achievable with
   CSS + IntersectionObserver.
2. **Location and hosting:** everything under `site/` at the repo root,
   deployed to **Vercel** as a static project with Root Directory `site`
   (`site/vercel.json` is the effective host config: clean URLs, security
   headers, cache tiers). The public domain is `https://windtunnel.observer`.
   Deploy paths: dashboard import of the GitHub repo with Root Directory
   `site` (continuous deploys on push), or `npx vercel --cwd site --prod`.
   After any domain change run `./scripts/set-site-domain.sh <url>` (it stamps
   the `__SITE_URL__` token or re-stamps a previous host in every HTML page,
   robots.txt, sitemap.xml and llms.txt; idempotent) and redeploy. On a domain
   change, the old-host 301 to the new host is a Vercel domain-level redirect
   configured in the dashboard: a manual operator step no code in `site/` can
   express. `site/_headers` is
   Netlify/Cloudflare syntax, inert on Vercel, and kept for host portability;
   never delete one assuming the other covers it. `site/.vercel/` is the
   operator's project link and is gitignored. The site is not part of
   `render.yaml`. Never wire it into the Next app.
3. **Never animate anything except `transform` and `opacity`.** No animating
   `top/left/width/height`. No `window.addEventListener("scroll", ...)` —
   use IntersectionObserver and (where supported) CSS scroll-driven animations.
4. **`prefers-reduced-motion: reduce` collapses ALL motion** (see 8.6). This is
   non-negotiable.
5. **Honest copy is brand law** (see section 5). The forbidden-phrase list is
   as binding as the color tokens.
6. **Em dashes are banned in site copy.** Use a period or a comma instead.
7. **Cache-busters.** `styles.css?v=` and `motion.js?v=` are set by hand in
   every HTML page. Bump every HTML page together on every CSS/JS edit; a
   stale one silently serves old styles and has misled reviews before.
8. **Source images** live in `public/brand/` in this repo:
   - `resonance-logo-concept.png` — cone + hairline ring + lowercase wordmark on cream. The primary lockup reference.
   - `resonance-logo-mark-concept.png` — octagonal instrument bezel with an orange oscilloscope wave on black. The "instrument badge."
   - `resonance-wavelength-logo-concept.png` — fine cream wave stack with one orange thread, endpoint dots, on black. The Signal Wave motif.
   - `resonance-retro-wavelength-logo-concept.png` — bolder retro variant of the wave. Archived alternate; do not use on the site.
   These are concept sources, not shipped assets. The site ships only
   `site/assets/mark.svg` (from `public/brand/resonance-mark.svg`),
   `site/favicon.svg`, and `site/og.jpg` (rendered from `site/og.svg`, its
   source). `public/brand/brand-kit.html` is the living specimen page — open it
   in a browser to SEE every token below.

---

## 2. Brand kit — the mark

### 2.1 The Signal Cone (primary mark)

The mark is a glossy orange **cone**, tilted about 14 degrees, sitting inside a
thin hairline ring. Note on naming: internally the mark is nicknamed "the
pyramid." Its actual geometry is a cone (circular base), and any redrawn or
3D-rendered version must be a cone, not a four-sided pyramid. Canonical name in
code and files: `mark` / "the Signal Cone."

- Vector: `public/brand/resonance-mark.svg` (copy to `site/assets/mark.svg`).
- Production raster: crop the cone+ring from `resonance-logo-concept.png`.
- The ring reads as a resonance field around the cone. Keep it whenever the
  mark appears at 96 px or larger; below 96 px, drop the ring (it turns to noise).

**Variants (only these four):**

| Variant | Cone | Ring | Background |
|---|---|---|---|
| Primary / light | orange gradient | `#D9D4C5` hairline | cream `#F0EEE4` |
| Primary / dark | orange gradient | `rgba(240,238,228,.25)` hairline | stage `#0B0B0D` |
| Mono ink | solid `#0E0E0C` | same ink hairline | cream |
| Mono paper | solid `#F0EEE4` | same paper hairline | stage |

**Clearspace:** empty space around the mark of at least 1/2 the cone's height on
all sides. **Minimum size:** 32 px tall (favicon uses a simplified cone with no
ring). **Don'ts:** never recolor the cone (orange or mono only), never rotate it
upright or mirror it, never add drop shadows on flat layouts, never place the
cream-background lockup as an opaque box on a stage section (use the dark
variant), never letter-space or re-case the wordmark.

### 2.2 The wordmark

Lowercase `resonance`, set in the display font (Space Grotesk 500), tracking
`-0.02em`. The concept art uses a custom R with an orange notch on its leg; on
the website approximate it with plain type plus a 3 px orange underline segment
under the R only (a `::before` on the first letter wrapped in a span), or omit
the notch entirely. Do not attempt to redraw the custom R.

Lockups: mark above wordmark (hero, centered) or mark left of wordmark at cap
height (nav). Nothing else.

### 2.3 Secondary motifs

- **The Signal Wave** (`resonance-wavelength-logo-concept.png`): a stack of thin
  cream waves with ONE orange thread running through and terminating in dots.
  Meaning: the one framing that carries through the noise. Use as: section
  divider on stage sections, hero underline, footer signature. An inline SVG
  recipe is in appendix A.3, so it can sit on any background.
- **The Instrument Bezel** (`resonance-logo-mark-concept.png`): octagonal
  technical frame with an oscilloscope wave. Use sparingly as a "badge" image
  in the methodology section or as social/OG imagery. Never as the logo.

### 2.4 The shape library (the Stage cast)

Stage sections feature large, soft-lit, GRAYSCALE 3D primitives on a faint
grid, in the style of the "Shapes" reference the founder supplied (dark field,
low-key lighting, subtle top highlight). Five primitives, each with an assigned
meaning so usage stays consistent:

| Shape | Represents | Where it appears |
|---|---|---|
| Stepped wedge (ziggurat) | the funnel, stage by stage | "How it works" stage strip |
| Capsule | a raw stored answer | hero drift field |
| Faceted polyhedron (icosahedron-like) | the citation/knowledge graph | methodology stage |
| Soft cube | a block of evidence | case-study stage strip |
| Cone (ORANGE only) | the client's brand, resonating | hero + wherever the brand "wins" |

Rendering rules: shapes are `#17171A` fills with `#6E6E73` strokes and a soft
top-light gradient, on stage black with the grid (A.2). The cone is the only
one ever orange. SVG recipes for all five are in `public/brand/brand-kit.html`
(view source and copy). If you can produce pre-rendered WebP shapes matching
the reference instead, prefer those at <= 200 KB each; SVGs are the guaranteed
fallback.

---

## 3. Brand kit — color

Two palettes, one per world. Hexes are law; do not invent new tints.

### 3.1 Dossier (light sections)

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F0EEE4` | section background |
| `--paper-2` | `#E6E3D6` | cards, wells |
| `--ink` | `#0E0E0C` | headings, body |
| `--ink-60` | `rgba(14,14,12,.60)` | secondary text |
| `--hairline` | `rgba(14,14,12,.15)` | borders, rules |
| `--accent` | `#F15A24` | CTA fill, links, the cone |
| `--accent-ink` | `#7A2A0E` | small orange text on cream (AA-safe) |

### 3.2 Stage (dark sections)

| Token | Hex | Use |
|---|---|---|
| `--stage` | `#0B0B0D` | section background |
| `--stage-2` | `#141416` | raised panels |
| `--grid-line` | `rgba(240,238,228,.05)` | background grid |
| `--fog` | `#B9B6AC` | body text on stage |
| `--fog-bright` | `#F0EEE4` | headings on stage |
| `--shape-fill` | `#17171A` | primitive bodies |
| `--shape-stroke` | `#6E6E73` | primitive edges |
| `--accent` | `#F15A24` | the cone, the wave thread, CTAs |

### 3.3 Rules

- **Usage ratio:** light sections roughly 60% paper / 30% ink / <= 10% orange.
  Stage sections roughly 70% black / 25% grays / <= 5% orange. If a stage
  section has more than one orange element plus the CTA, remove one.
- **One accent, locked.** Orange is the only accent on the entire site. No
  second color ever (no blue links, no green checkmarks; "ok/warn" semantics
  do not exist on the marketing site).
- **Contrast (verify with a checker before shipping):** ink on paper ~15:1
  (fine); fog on stage ~9:1 (fine); orange `#F15A24` on paper ~3.0:1 — LARGE
  text (>= 24 px) and graphics only, never body text; use `--accent-ink` for
  small orange text on cream. Orange on stage ~6:1 (fine at any size). Button:
  white/cream text on orange fill passes at >= 18 px semibold; check it.
- **Note for taste-skill readers:** the cream+ink palette is not a
  "premium-consumer default reach" — it is Windtunnel's existing, explicitly
  documented brand system (the operator app's ink/paper dossier language),
  carried onto the public site for product continuity. That is the named-brand
  override, and orange is the locked single accent.

---

## 4. Brand kit — typography, spacing, structure

### 4.1 Fonts (all on Google Fonts, `display=swap`)

| Role | Font | Weights | Notes |
|---|---|---|---|
| Display / headlines | **Space Grotesk** | 500, 700 | geometric, matches the wordmark's voice |
| Body | **Inter** | 400, 600 | deliberate continuity with the product app |
| Labels / stamps / data | **IBM Plex Mono** | 400, 500 | the dossier voice; uppercase, tracked |

No serif anywhere on the site. Emphasis inside a headline = same-family italic
or 700, never a different family.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 4.2 Type scale (desktop / mobile, px)

| Style | Font | Size | Line | Tracking | Case |
|---|---|---|---|---|---|
| H1 hero | Space Grotesk 700 | 72 / 40 | 1.02 | -0.02em | sentence |
| H2 section | Space Grotesk 700 | 44 / 30 | 1.05 | -0.015em | sentence |
| H3 card | Space Grotesk 500 | 24 / 20 | 1.2 | -0.01em | sentence |
| Body | Inter 400 | 17 / 16 | 1.6 | 0 | sentence, `max-width: 65ch` |
| Stat number | Space Grotesk 700 | 56 / 36 | 1 | -0.02em | tabular-nums |
| Mono label | IBM Plex Mono 500 | 12 / 11 | 1.4 | +0.08em | UPPERCASE |
| Stamp | IBM Plex Mono 500 | 11 | 1 | +0.08em | UPPERCASE, 1px border, 2px radius |

**Mono-label budget:** the uppercase mono label above a headline is a signature
move, and it dies from repetition. With ~8 sections, use it on at most 3.

### 4.3 Spacing, radius, borders, grid

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192. Section
  vertical padding: 128 desktop / 64 mobile. Never invent off-scale values.
- Radius: stamps 2 px; cards and wells 12 px; buttons fully rounded (pill).
  Images/shape containers 16 px.
- Borders: 1 px hairlines everywhere (`--hairline` on paper, `--grid-line` x3
  opacity on stage). No box-shadows on cream. On stage, an optional single soft
  glow under the cone only: `filter: drop-shadow(0 24px 48px rgba(241,90,36,.18))`.
- Layout grid: max-width 1200 px, 24 px gutters, CSS Grid only (no flex
  percentage math). Full-bleed stage sections; content still capped at 1200.
- Buttons: primary = orange pill, cream text, mono uppercase label; hover
  darkens orange ~8% and translates -1 px. Secondary = 1 px outline pill in
  the current world's text color. CTA labels: <= 3 words, never wrap.

---

## 5. Voice and copy law (as binding as the hexes)

Tone: calm, precise, instrument-like. Short declaratives. Numbers wherever a
number exists. The reader should feel "these people count things."

**Forbidden on the entire site (the honesty rail):**

| Never write | Because | Write instead |
|---|---|---|
| "guaranteed rankings", "get #1 in ChatGPT" | LLM outputs are probabilistic; the product's founding law | "measure how often you appear, with confidence intervals" |
| any revenue/ROI/sales prediction from simulation | simulation is comparative only | "which framing resonates most, tested before you spend" |
| "purchase probability" for Response lift | Response lift is a survey-construct shift; Shortlist lift is a simulated shortlist-inclusion change | "a shift in expressed purchase intent (1 to 5 scale)"; "shortlist lift in percentage points" |
| unlabeled simulated numbers | measured/simulated wall | every simulated figure carries a SIMULATED stamp |
| worked examples or invented figures presented as measured | evidence discipline | stamp them ILLUSTRATIVE; the site publishes no fictional brand |
| a named study implying a commercial relationship | proof-library law (playbook §9) | "self-initiated; not a client, did not commission this, did not endorse it" on every named-study surface |
| "monitoring", "track your movement" | the product has no scheduler (PRD §6) | "re-audit: the same prompts, the same method, a quarter later" |

Additional copy rules: no em dashes; one CTA intent per label, and exactly
three intents sitewide, each with identical wording wherever it appears:
**"Request a brand audit"** (primary: nav pill, hero, `mailto:`),
**"See two real findings"** (secondary, hero ghost button, anchors to
`#finding`), and **"Email the research team"** (footer). Study links read
"Read the full study" / "See the full study". No fourth intent.

Approved headline vocabulary: measure, test, recommend, shortlist, top
choice, message, evidence, sample, confidence. Live hero H1 (canonical until
the playbook's §10.2 tightening is adopted): "Understand how AI recommends
your brand. Test what moves you toward its top choice." Sub: "We measure where
you stand in AI answers today, then test one Current message against one New
message and report the lift in shortlist and top-choice rates. Every figure
labeled measured or simulated."

---

## 6. Site architecture

```
site/
  index.html          landing page, 8 sections + FAQ + contact footer
  studies.html        the studies hub (one teaser card per published study)
  studies/
    insta360.html     the Insta360 study (associations across 25 stored answers)
  methodology.html    repeated sampling and confidence intervals
  method/
    mention-rate.html       definition: mention rate
    shortlist-rate.html     definition: shortlist rate (top-five inclusion rate)
    top-choice-rate.html    definition: top-choice rate
    shortlist-lift.html     definition: shortlist lift
    stability-index.html    definition: stability index
    repeated-sampling.html  definition: repeated sampling
  404.html            on-brand not-found page (noindex; Vercel serves it automatically)
  styles.css          tokens + layout + motion CSS (+ hub teasers, term cards)
  motion.js           IntersectionObserver reveals, nav state, zoom transitions
  vercel.json         EFFECTIVE host config: cleanUrls, www-to-apex 301, security headers (CSP, HSTS), cache tiers
  _headers            Netlify/Cloudflare equivalent; inert on Vercel; kept for portability
  robots.txt          Allow all + explicit AI-crawler groups (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended); points at the sitemap
  sitemap.xml         every public page with lastmod (absolute URLs stamped by scripts/set-site-domain.sh)
  llms.txt            plain-text site map for LLM crawlers (stamped absolute URLs)
  og.jpg              1200x630 OG image (rendered from og.svg)
  og.svg              OG image source
  favicon.svg         simplified cone, no ring
  .gitignore          .vercel
  assets/
    mark.svg          from public/brand/resonance-mark.svg
scripts/set-site-domain.sh   stamps __SITE_URL__ / re-stamps the live host into every HTML page, robots.txt, sitemap.xml, llms.txt
```

A landing page, the studies hub with one page per real study under
`/studies/<slug>`, `/methodology`, definition pages under `/method/<term>`,
plus 404; anchor navigation on the landing page. Nav is a fixed top
bar: mark + wordmark left; links **How it works** (`/#workflow`), **What we
measure** (`/#metrics`), **What we found** (`/#finding`), **Method**
(`/methodology`), **Studies** (`/studies`); "Request a brand audit" pill right.
Nav background: transparent over the hero, then `--stage` at 92% opacity with a
hairline bottom border once scrolled past 80 px (toggle a class via
IntersectionObserver on a sentinel div — not a scroll listener). A hamburger
drawer replaces the link row below 768 px.

Clean URLs: `vercel.json` sets `cleanUrls: true`, so `/studies` resolves in
production and `/studies.html` redirects; the plain local Python server needs
`/studies.html`.

---

## 7. Page blueprint (section by section, mirrors the live site)

Layout-family discipline: the sections below use at least 5 distinct layout
families; no family repeats more than twice, and no two image+text splits are
adjacent. Section ids and H2s are the live ones; change the site first, then
this list.

**Hero (Stage; `aria-label="Introduction"`; family: split with report panel).**
Stage black + grid. Left: eyebrow, H1, sub, primary CTA "Request a brand
audit", ghost CTA "See two real findings". Right: a cream `.report-panel`
showing a REAL study excerpt (currently Insta360, 19 Jul 2026, run
`a45cbc1e`: mention rate with Wilson CI, share-of-voice bars, organic
sentiment, and the two Leica Message Lift results with their "not a
head-to-head" note). Every figure on the panel traces to a stored run. Below
the panel, three cited macro statistics (Gartner, Deloitte, Morgan Stanley),
each with its source named (playbook §5.1).

**01 — How it works (`#workflow`; Dossier; family: four-node timeline).**
H2 "As our client, you will always know where you stand." Four client
questions in order: Prompt discovery ("What do your customers ask AI?"),
Baseline audit ("Where do you stand in AI answers today?"), Message Lift test
("Would a new message move you up?", SIMULATED stamp), Re-audit ("Are you
gaining or losing ground?" — same prompts, same method, a quarter later).
Horizontal `ol` timeline with a terminal arrow on desktop, vertical on mobile.

**02 — What we measure (`#metrics`; Dossier; family: 2.5D pillar cards).**
H2 "What we measure, and what each number means." Four cards, one per pillar,
each with its client question, a worked example well, and its metric names:
Presence (Mention Rate, Share of Voice, Avg First Position), Position (Organic
Recommendation Rate, Comparative Win Rate), Perception (Sentiment, Attribute
associations), Proof (Accuracy Rate, Citation Share). Examples are stamped
ILLUSTRATIVE unless they are real (the two Insta360 wells are stamped
MEASURED · INSTA360 · N=25). Confidence rail under the cards.

**03 — What we found (`#finding`; Stage; family: two collapsed study cards).**
H2 "Two studies. One found a missing story. One said no." Two `<details>`
cards with the business-value headline visible when closed: the Insta360
framing study (MEASURED, n=25, DeepSeek, not a client) and the anonymized
hotel Message Lift test (SIMULATED, n=30 per message, negative result). Each
card carries its limits and the not-a-client disclosure; the Insta360 card
links to `/studies`.

**04 — Why now (`#why-now`; Dossier; family: narrative + four-point rail).**
H2 "The click no longer tells the whole story." The attribution blind spots
(no click, no referral, AI shortlist not visible, outdated description before
the visit).

**05 — What you get (`#what-you-get`; Dossier; family: diagram).**
H2 "The old A/B test finds a winner. The new one finds the next message."
Message Lift explained structurally: Current message → shared contexts, only
the message changes → New message; the two test types and their results;
comparative-only disclaimer.

**06 — How the scoring works (`#methodology`; Stage; family: five-stage
pipeline).** H2 "From free-text answer to labeled number." Stored answer →
embedding → cosine vs anchors → distribution → labeled result, with the SSR
attribution sentence ("independent peer-reviewed research (arXiv:2510.08338),
which Windtunnel productizes") and the Glass Box sentence verbatim.

**07 — Method and limitations (`#method`; Dossier; family: definition list +
FAQ).** H2 "Evidence you can inspect." Repeated sampling; measured versus
simulated; Current/New prompt parity; provider and model disclosure; sample
size and uncertainty; results that say no; snapshot limitations. FAQ in
`<details>`: GEO/AEO adjacency, how Message Lift works, why repeat a prompt,
consumer-interface non-equivalence, the free-checker difference, day-to-day
variance, and Singapore/APAC markets.

**Contact (`#contact`; Stage; family: signature band).**
H2 "Find out where your brand stands." "Email the research team" pill + the
plain `mailto:`. Small print: "Measured and simulated figures are labeled. No
ranking guarantees. Independent studies are not client endorsements." Mark +
wordmark, mono line "Windtunnel (windtunnel.observer) · AI visibility audits
and message tests · Singapore · 2026".

**/studies (`studies.html`, the hub).** One teaser card per published study:
stamps, headline linking to the study page, a two-sentence summary, and the
not-a-client disclosure under the list. Title pattern "Studies · Windtunnel".
JSON-LD: CollectionPage with an ItemList of study URLs.

**/studies/<slug> (`studies/<slug>.html`).** One study per page. Fixed
structure: the question, the verbatim prompt set, sample size and route, the
findings table, "What this study does not show", the not-a-client disclosure,
and the contact band. Title pattern "<Brand> study · Windtunnel". JSON-LD:
Article (headline = H1, datePublished, author/publisher = the site
Organization, about = the studied brand with no `url`).

**/methodology (`methodology.html`).** Repeated sampling, which metrics carry
Wilson intervals, the n>=30 gate, where a conclusion stops, and the term grid.
Title pattern "Repeated sampling and confidence intervals · Windtunnel
method". JSON-LD: TechArticle + DefinedTermSet (`@id`
`.../methodology#terms`).

**/method/<term> (`method/<term>.html`).** Definition pages: the term as H1,
the definition paragraph, "How it is computed", "Where this appears", "What
it does not mean", and the label rules. Title pattern "<Term> · Windtunnel
method". JSON-LD: DefinedTerm (description = the definition paragraph
verbatim) + WebPage; shortlist-rate adds alternateName "Top-five inclusion
rate".

---

## 8. Motion system (exact specs)

### 8.1 Tokens

```css
:root {
  --ease-silk: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-micro: 140ms;   /* hovers */
  --dur-reveal: 700ms;  /* section reveals */
  --dur-zoom: 420ms;    /* section zoom transitions */
  --drift-amp: 14px;    /* ambient drift amplitude */
}
```

### 8.2 Ambient motion (the "slow rotation" requirement)

Continuous, hypnotic, nearly subliminal. All CSS keyframes, all `transform`.

- **Cone:** `rotate` sway -6deg to +6deg over 12s ease-in-out alternate, plus
  `translateY` float of 10 px over 9s alternate (two nested wrappers, one
  animation each; never two animations on one transform).
- **Ring:** opacity pulse .35 to .6 over 6s, plus scale 1 to 1.04.
- **Primitives:** each gets `rotate(360deg)` over 90 to 140s linear infinite
  (vary per shape: 90, 105, 120, 140) plus a translate drift over 12 to 18s
  alternate. Stagger `animation-delay` so nothing syncs.
- Apply `will-change: transform` ONLY to these ambient elements.

### 8.3 Entrance reveals (every section)

Elements with `data-reveal` start `opacity: 0; transform: translateY(24px) scale(.96)`
and transition to identity over `--dur-reveal` `--ease-silk` when the section
enters the viewport. Stagger children by `calc(var(--i) * 90ms)`. Implemented
with one IntersectionObserver (threshold .18, `rootMargin: 0 0 -10% 0`),
adding class `.in`, unobserving after fire. Full code in A.4.

### 8.4 Zoom transitions (the "zoom in/out" requirement)

Two mechanisms, both cheap:

1. **Nav-click zoom-through.** Clicking a nav anchor does not jump. Sequence:
   `<main>` gets class `.zoom-out` (`transform: scale(1.035); opacity: 0;`
   transition `--dur-zoom` `--ease-silk`); on `transitionend`, jump instantly
   (`scrollIntoView({behavior:"instant"})` on the target with scroll-margin for
   the fixed nav), swap to `.zoom-in` (from `scale(.97); opacity: 0`) and force
   reflow, then remove the class so it settles to identity. Total feel: the
   page dives through, ~800 ms. Full code in A.5.
2. **Hero scroll zoom.** As the user scrolls off the hero, the cone group
   scales 1 to 1.3 and fades. Progressive enhancement only:
   `@supports (animation-timeline: view())` drives it with a scroll-driven
   animation (code in A.6); browsers without support simply keep the static
   hero. Do NOT polyfill with a scroll listener.

### 8.5 Micro-interactions

Buttons/cards: `--dur-micro`, translate -1 to -2 px, never scale text blocks.
Links: orange underline slides in (background-size trick, 140 ms).

### 8.6 Reduced motion (mandatory)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
}
```
And in `motion.js`: if `matchMedia("(prefers-reduced-motion: reduce)").matches`,
skip the zoom-through entirely (plain anchor jump) and add `.in` to every
`[data-reveal]` immediately.

### 8.7 Forbidden

No scroll listeners, no rAF loops, no parallax libraries, no scroll-hijack, no
autoplaying video, no cursor followers, no magnetic buttons, no text scramble.

---

## 9. Performance, a11y, SEO

- Budget: total page weight <= 1.5 MB; each shape image <= 200 KB WebP;
  fonts subset by Google, `display=swap`. Lazy-load (`loading="lazy"`) every
  image below the hero. All images have explicit `width`/`height` or
  `aspect-ratio` (zero layout shift).
- Semantic landmarks: `header`, `main`, one `section` per S-block with
  `aria-labelledby`, `footer`. One `h1` only. Focus-visible: 2 px orange
  outline, 2 px offset, on every interactive element. All shape images
  `alt=""` (decorative); the mark's alt is "Windtunnel".
- Keyboard: nav anchors work without JS (zoom transition is enhancement).
- Meta: every page has its own `<title>` (landing: "Windtunnel · Measure how
  AI recommends your brand"; study pages: "<Brand> study · Windtunnel"),
  a description under 155 chars in the same voice, a `<link rel="canonical">`,
  and absolute `og:image` / `twitter:image` URLs (`site/og.jpg`, 1200x630,
  rendered from `og.svg`; render with the brand webfonts supplied, e.g.
  headless Chrome against an HTML wrapper that loads the Google Fonts
  stylesheet for Instrument Serif, Space Grotesk, IBM Plex Mono, and Inter,
  so the wordmark and headline do not fall back). Absolute URLs come from the `__SITE_URL__` stamp;
  after a domain change re-run `scripts/set-site-domain.sh` and resubmit
  `sitemap.xml` in Search Console so the same-host URLs are read. `404.html`
  carries `<meta name="robots" content="noindex">`.
- Structured data: inline `application/ld+json` only. It is data, not executed
  script, so the CSP is untouched. Landing: Organization + WebSite + WebPage +
  FAQPage in one `@graph` (Organization `@id` `.../#org`; `sameAs` only ever
  points at real operator profiles, omitted entirely when there are none).
  Hub: CollectionPage + ItemList. Study pages: Article. Method pages:
  DefinedTerm + WebPage. Methodology: TechArticle + DefinedTermSet. FAQ and
  definition text in JSON-LD equals the visible text, character for character.
- `llms.txt` lists the positioning statement, every study (with the
  not-a-client line wherever a brand is named), every method page, and
  contact, in absolute stamped URLs.
- `sitemap.xml` carries one `<url>` per public page with `<lastmod>`:
  `/` priority 1.0, studies 0.8, methodology 0.7, method pages 0.6. A future
  post-submit page (`thanks.html`) never enters the sitemap. Resubmit on URL
  changes.
- Target Lighthouse >= 90 on all four categories, mobile.

---

## 10. Maintenance order (follow exactly)

The site is built and live; this is the order for every subsequent edit.

1. Edit copy or structure in `site/*.html`; keep section ids and H2s in step
   with section 7 (update section 7 in the same change if they move).
2. Run the playbook's §5.3 banned-vocabulary grep and this guide's section 5
   table over `site/*.html`. Any hit blocks the change.
3. Verify every new figure against a stored run or a named third-party source
   (playbook §9.2). Stamp it MEASURED / SIMULATED / DIRECTIONAL / ILLUSTRATIVE.
4. If CSS or JS changed, bump the `?v=` cache-buster on every HTML page.
5. Run the pre-flight checklist (section 11).
6. Commit with explicit paths (never `git add -A`; `site/.vercel/` is ignored).
7. Deploy (Vercel dashboard on push, or `npx vercel --cwd site --prod`). If
   the domain changed, run `./scripts/set-site-domain.sh <url>` first.
8. After deploy: check `/`, `/studies`, `/studies/insta360`, `/methodology`,
   one `/method/*` page, and `/llms.txt` return 200 and `/404` returns 404;
   confirm the `www` host 301s to the apex; then resubmit `sitemap.xml` if
   URLs changed.

Local test: `python3 -m http.server 8080 --directory site` then open
`http://localhost:8080` (use `/studies.html` locally; `/studies` only resolves
on Vercel).

## 11. Pre-flight checklist (mechanical, all must pass)

- [ ] Exactly one accent color anywhere on the page (orange).
- [ ] Orange body-size text never sits on cream (only `--accent-ink` does).
- [ ] Every CTA fits on one line at 1280 px and at 320 px.
- [ ] Exactly three CTA intents sitewide, identical wording per intent (5).
- [ ] Uppercase mono labels above headlines: count <= 3 per page.
- [ ] >= 5 distinct section layout families; no 3 consecutive image+text splits.
- [ ] All animations are `transform`/`opacity` only (grep the CSS).
- [ ] No `addEventListener("scroll"` anywhere (grep the JS).
- [ ] Reduced-motion: toggle it in devtools; page is fully readable and static.
- [ ] 320 px and 375 px wide: no horizontal scrollbar; hero cone <= 60vw.
- [ ] Every simulated, directional, or illustrative figure has its stamp.
- [ ] Every run figure traces to a stored run; every macro stat names its source.
- [ ] No forbidden phrases (playbook §5.3 grep; also "guarantee", "ROI", "#1", "probability", "monitoring", "agentic shopping").
- [ ] No em dash characters in HTML copy (grep for the character).
- [ ] `grep -c __SITE_URL__ site/*` = 0 and no stale host (`resonance.observer`) anywhere.
- [ ] `site/vercel.json` parses as JSON; `_headers` still present.
- [ ] Every `<script type="application/ld+json">` block parses as JSON, and
      FAQ/definition text inside it equals the visible text.
- [ ] `sitemap.xml` `<loc>` count equals the public page count, and every
      study surface naming a brand carries the not-a-client disclosure.
- [ ] `styles.css?v=` and `motion.js?v=` identical across every HTML page.
- [ ] HTML tag balance clean on every HTML page; no duplicate ids or `style` attributes.
- [ ] Page weight <= 1.5 MB; Lighthouse mobile >= 90 x4.
- [ ] Zero console errors; works with JS disabled (static + anchors).

---

## Appendix A — copy-paste code

### A.1 tokens (top of styles.css)

```css
:root {
  --paper: #F0EEE4; --paper-2: #E6E3D6;
  --ink: #0E0E0C; --ink-60: rgba(14,14,12,.6);
  --hairline: rgba(14,14,12,.15);
  --stage: #0B0B0D; --stage-2: #141416;
  --grid-line: rgba(240,238,228,.05);
  --fog: #B9B6AC; --fog-bright: #F0EEE4;
  --shape-fill: #17171A; --shape-stroke: #6E6E73;
  --accent: #F15A24; --accent-ink: #7A2A0E;
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --ease-silk: cubic-bezier(0.22,1,0.36,1);
  --dur-micro: 140ms; --dur-reveal: 700ms; --dur-zoom: 420ms;
}
```

### A.2 stage grid background

```css
.stage {
  background-color: var(--stage);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 48px 48px;
}
```

### A.3 Signal Wave (inline SVG, tint via currentColor; orange thread fixed)

```html
<svg viewBox="0 0 960 160" fill="none" aria-hidden="true" class="wave">
  <g stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55">
    <path d="M120 64c120 0 160-40 240-40s120 56 240 56 160-32 240-32"/>
    <path d="M100 84c130 0 170-28 250-28s130 44 250 44 170-24 260-24"/>
    <path d="M120 104c120 0 160 24 240 24s120-48 240-48 160 40 240 40"/>
    <path d="M140 124c110 0 150 16 230 16s110-36 230-36 150 28 220 28"/>
  </g>
  <g stroke="#F15A24" stroke-width="6" stroke-linecap="round">
    <path d="M40 80h180c90 0 130-36 220-36s130 72 220 72 130-36 260-36"/>
  </g>
  <circle cx="40" cy="80" r="12" fill="#F15A24"/>
  <circle cx="920" cy="80" r="12" fill="#F15A24"/>
</svg>
```

### A.4 reveals (motion.js)

```js
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const items = document.querySelectorAll("[data-reveal]");
if (reduced) { items.forEach(el => el.classList.add("in")); }
else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      e.target.classList.add("in"); io.unobserve(e.target);
    }
  }, { threshold: 0.18, rootMargin: "0px 0px -10% 0px" });
  items.forEach(el => io.observe(el));
}
```
```css
[data-reveal] { opacity: 0; transform: translateY(24px) scale(.96);
  transition: opacity var(--dur-reveal) var(--ease-silk),
              transform var(--dur-reveal) var(--ease-silk);
  transition-delay: calc(var(--i, 0) * 90ms); }
[data-reveal].in { opacity: 1; transform: none; }
```

### A.5 nav zoom-through (motion.js)

```js
const main = document.querySelector("main");
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", (ev) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target || reduced) return;            // reduced motion: native jump
    ev.preventDefault();
    main.classList.add("zoom-out");
    main.addEventListener("transitionend", function go() {
      main.removeEventListener("transitionend", go);
      target.scrollIntoView({ behavior: "instant", block: "start" });
      main.classList.remove("zoom-out");
      main.classList.add("zoom-in");
      void main.offsetWidth;                   // reflow so .zoom-in start state applies
      main.classList.remove("zoom-in");
      history.pushState(null, "", a.getAttribute("href"));
    }, { once: true });
  });
});
```
```css
main { transition: transform var(--dur-zoom) var(--ease-silk),
                   opacity var(--dur-zoom) var(--ease-silk); }
main.zoom-out { transform: scale(1.035); opacity: 0; }
main.zoom-in  { transform: scale(.97);  opacity: 0; transition: none; }
section { scroll-margin-top: 88px; }
```

### A.6 hero scroll zoom (progressive enhancement)

```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .hero-cone {
      animation: hero-dive linear both;
      animation-timeline: view();
      animation-range: exit 0% exit 100%;
    }
    @keyframes hero-dive {
      to { transform: scale(1.3); opacity: 0; }
    }
  }
}
```

### A.7 ambient keyframes

```css
@media (prefers-reduced-motion: no-preference) {
  .sway   { animation: sway 12s ease-in-out infinite alternate; }
  .floaty { animation: floaty 9s ease-in-out infinite alternate; }
  .spin-90  { animation: spin 90s  linear infinite; }
  .spin-120 { animation: spin 120s linear infinite; }
  .ring-pulse { animation: ringpulse 6s ease-in-out infinite alternate; }
}
@keyframes sway   { from { rotate: -6deg; } to { rotate: 6deg; } }
@keyframes floaty { from { translate: 0 0; } to { translate: 0 -10px; } }
@keyframes spin   { to { rotate: 360deg; } }
@keyframes ringpulse { from { opacity: .35; scale: 1; } to { opacity: .6; scale: 1.04; } }
```

---

*End of guide. Open `public/brand/brand-kit.html` in a browser to see every
token, the mark, the shape library, and the motion specs running live.*
