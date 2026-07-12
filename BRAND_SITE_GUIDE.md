> LIFECYCLE: ACTIVE · ROLE: PLAYBOOK · OWNS: Resonance site structure and copy guide (active brand under D-106)

# BRAND_SITE_GUIDE.md — The Resonance Brand Website

> An execution guide for building the public Resonance brand/marketing website.
> Written to be executed by a coding agent with no prior context. Read top to bottom
> once, then follow section 10 (build order) step by step. Every ambiguous decision
> has already been made for you; do not improvise where this guide is specific.
>
> STATUS: proposal — adopted for build, but not yet a MASTER_CONTEXT decision.
> The website is a STANDALONE artifact. It must not import from, link into, or be
> served by the operator app in `/src`. It never touches the database, providers,
> or any app code. Everything you build lives in a new top-level `site/` folder.

---

## 0. Design read (what you are building and why it looks this way)

**One-line design read:** a precision instrument brand telling a "signal in the
noise" story: dark instrument-stage sections where grayscale geometry drifts in
slow motion, alternating with cream evidence-dossier sections where the numbers
live; one orange signal — the cone — is the only colored object in the world.

**Audience:** potential clients (brand/marketing leaders buying AI-visibility
audits) and venture investors doing diligence. Both want: what is this, does it
work, is it rigorous, who is behind it. Neither wants hype.

**The concept.** Resonance measures how AI assistants describe brands, and
simulates how buyers respond to different brand framings. The site dramatizes
exactly that:

- The **Stage** (near-black sections): the AI landscape. Anonymous grayscale
  3D primitives float and slowly rotate — these are "all the brands, as AI sees
  them." Undifferentiated. Interchangeable.
- The **Signal** (the orange cone): the one shape that resonates — the client's
  brand once it is measured, corrected, and tested. The cone is the ONLY
  saturated object anywhere on the site. Orange never appears on anything else
  except interactive accents (CTA, links, the wave motif).
- The **Dossier** (cream sections): where evidence lives. Numbers, method,
  case studies. Calm paper, ink text, mono stamps — the visual language of the
  Resonance product itself, so the site and the tool feel like one instrument.

**Why this is honest branding, not decoration:** Resonance's differentiator is
statistical honesty (confidence intervals, sample gates, a hard wall between
measured and simulated data). The site must *feel* like an instrument, not an
agency hype page. Every design choice below serves that.

---

## 1. Ground rules (read before writing any code)

1. **Standalone static site.** Plain HTML + CSS + vanilla JS. No React, no
   build step, no npm dependencies, no CDN JS libraries. One `index.html`,
   one `styles.css`, one `motion.js`, plus assets. Rationale: zero-dependency
   sites cannot rot, and this guide's motion specs are all achievable with
   CSS + IntersectionObserver.
2. **Location:** everything under `site/` at the repo root. Deploy later as a
   Render Static Site (or any static host). Never wire it into the Next app.
3. **Never animate anything except `transform` and `opacity`.** No animating
   `top/left/width/height`. No `window.addEventListener("scroll", ...)` —
   use IntersectionObserver and (where supported) CSS scroll-driven animations.
4. **`prefers-reduced-motion: reduce` collapses ALL motion** (see 8.6). This is
   non-negotiable.
5. **Honest copy is brand law** (see section 5). The forbidden-phrase list is
   as binding as the color tokens.
6. **Em dashes are banned in site copy.** Use a period or a comma instead.
7. **Source images** live in `public/brand/` in this repo:
   - `resonance-logo-concept.png` — cone + hairline ring + lowercase wordmark on cream. The primary lockup reference.
   - `resonance-logo-mark-concept.png` — octagonal instrument bezel with an orange oscilloscope wave on black. The "instrument badge."
   - `resonance-wavelength-logo-concept.png` — fine cream wave stack with one orange thread, endpoint dots, on black. The Signal Wave motif.
   - `resonance-retro-wavelength-logo-concept.png` — bolder retro variant of the wave. Archived alternate; do not use on the site.
   Copy the first three into `site/assets/` before you start. Also in
   `public/brand/`: `resonance-mark.svg` (vector cone, built alongside this
   guide) and `brand-kit.html` (living specimen page — open it in a browser to
   SEE every token below).

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
  "premium-consumer default reach" — it is Resonance's existing, explicitly
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
| "purchase probability" for ΔPI | ΔPI is a survey-construct shift | "a shift in expressed purchase intent (1 to 5 scale)" |
| unlabeled simulated numbers | measured/simulated wall | every simulated figure carries a SIMULATED stamp |
| case-study data presented as a real client without consent | evidence discipline | label demo studies "DEMONSTRATION DATA" in a stamp |

Additional copy rules: no em dashes; one CTA intent per label, and exactly two
intents on the whole page: **"Request an audit"** (primary, appears in nav,
hero, footer with identical wording) and **"Read the methodology"** (secondary,
hero + case studies, identical wording). No third CTA.

Approved headline vocabulary: measure, verify, evidence, framing, resonate,
signal, sample, confidence. Sample hero H1 (use or improve within voice):
"AI already has an opinion about your brand." with the sub: "Resonance measures
it, verifies it against the facts, and tests the framings buyers respond to.
With confidence intervals, not vibes."

---

## 6. Site architecture

```
site/
  index.html          single page, 8 sections + footer
  styles.css          tokens + layout + motion CSS
  motion.js           IntersectionObserver reveals + zoom transitions (~120 lines)
  assets/
    mark.svg                    from public/brand/resonance-mark.svg
    logo-concept.png            cropped hero lockup source
    wave.svg                    inline-able Signal Wave (A.3)
    bezel.png                   from resonance-logo-mark-concept.png
    shapes/*.svg or *.webp      the five primitives
  favicon.svg         simplified cone, no ring
```

One page, anchor navigation. Nav is a fixed top bar: mark + wordmark left;
links Product, Method, Case studies, Investors; "Request an audit" pill right.
Nav background: transparent over the hero, then `--stage` at 92% opacity with a
hairline bottom border once scrolled past 80 px (toggle a class via
IntersectionObserver on a sentinel div — not a scroll listener).

---

## 7. Page blueprint (section by section)

Layout-family discipline: the 8 sections below use 6 distinct layout families;
no family repeats more than twice, and no two image+text splits are adjacent.

**S0 — Hero (Stage; family: full-bleed centered).**
Stage black + grid. Center: the Signal Cone (dark variant, ~360 px) with the
hairline ring, slow-rotating (8.2). Around it, 3 to 4 grayscale primitives
drift at different depths (parallax via different animation amplitudes, not
scroll listeners). H1 + sub + the two CTAs. Below, the Signal Wave as a
divider. On scroll away, the hero zooms subtly (8.4).

**S1 — The problem (Stage; family: narrative column).**
One 60ch column of fog text over the drifting-shapes field, dimmed. Copy story:
buyers now ask AI first; AI's answer is a distribution, not a fact; most brands
have never measured theirs. End with a mono label: "01 / WHAT AI SAYS TODAY".

**S2 — What Resonance does (Dossier; family: numbered dossier rows).**
Cream. Four full-width hairline-separated rows, numbered 01 to 04 in mono:
Presence ("Are you in AI's consideration set?"), Position ("When compared, do
you win?"), Perception ("How does AI describe you?"), Proof ("Is the story
true, and sourced?"). Each row: number, question, one sentence, small
grayscale glyph of its assigned shape. Confidence rail note under the rows:
"Every figure ships with sample size and confidence interval."

**S3 — How it works (Dossier; family: horizontal step rail).**
Four steps on a horizontal rail with hairline connectors: Measure (sampled
prompts across AI engines), Verify (claims checked against your fact sheet),
Simulate (synthetic panel tests candidate framings; SIMULATED stamp visible),
Report (evidence pack, every number traceable). Each step card: mono step
number, H3, two lines. The rail scrolls horizontally on mobile.

**S4 — Case studies (Dossier; family: asymmetric bento).**
Bento grid of 3 demo studies: one large card (2x2) + two small. Each card:
client archetype ("Consumer beverage brand"), stamp row (DEMONSTRATION DATA +
SIMULATED where applicable), one honest headline finding phrased comparatively
("Corrected framing lifted expressed intent +0.6 on a 5-point scale, n=48"),
and a real chart thumbnail (bar PMF or funnel heatmap rendered as simple SVG
bars, not a fake screenshot). Card hover: translate -2 px, hairline brightens.
No invented client names or logos.

**S5 — Methodology and honesty (Stage; family: manifesto + stat stamps).**
The trust section, and the most "brand" moment. Stage black. Faceted
polyhedron drifting behind. Large fog-bright statement: "We publish our
uncertainty." Below, a row of 4 stat stamps in mono: "k=5 samples per prompt",
"Wilson 95% intervals", "n >= 30 or labeled directional", "measured and
simulated data never mix". Then the honesty pledge paragraph, including that
uncalibrated scales are labeled and simulations are comparative only. Bezel
badge image sits right. Secondary CTA: "Read the methodology" links to a
static methodology page or the client guide PDF later; for v1, anchor to this
section (link target may be refined post-launch).

**S6 — For investors (Dossier; family: stat strip + column).**
Restrained. Mono label "FOR INVESTORS". One 65ch column: the category thesis
(AI assistants are becoming the buying interface; measurement plus simulation
is the wedge), then a 3-stat strip (Space Grotesk stat numbers): audits
delivered, prompts sampled, engines covered. Use REAL numbers from the founder
at build time; if a number is unavailable, cut the stat rather than invent it.
No revenue claims, no market-size theater.

**S7 — Contact / footer (Stage; family: signature band).**
Stage. The Signal Wave, full width. "Request an audit" pill + a plain mailto.
Small print: "Simulated results are comparative and labeled. No guarantees of
AI rankings are made or implied." Mark + wordmark, mono copyright line.

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
  `alt=""` (decorative); the mark's alt is "Resonance".
- Keyboard: nav anchors work without JS (zoom transition is enhancement).
- Meta: title "Resonance. AI brand audits with confidence intervals";
  description under 155 chars in the same voice; OG image = instrument bezel
  on stage with wordmark (1200x630, build from `bezel.png`).
- Target Lighthouse >= 90 on all four categories, mobile.

---

## 10. Build order (follow exactly)

1. Create `site/`, copy assets per section 6, write `styles.css` tokens block
   (A.1) and the grid background (A.2).
2. Build static HTML for all 8 sections with real copy (section 7), no motion.
   Check it reads well with CSS only.
3. Add fonts, type scale, buttons, stamps, hairlines. Check contrast (3.3).
4. Add the inline SVGs: mark (from `mark.svg`), wave (A.3), the five
   primitives (copy from `public/brand/brand-kit.html` source).
5. Add ambient CSS animations (8.2).
6. Add `motion.js`: reveals (A.4), nav state sentinel, zoom-through (A.5).
7. Add hero scroll zoom behind `@supports` (A.6). Add reduced-motion blocks.
8. Run the pre-flight checklist (section 11). Fix every failure before calling
   it done.

Local test: `python3 -m http.server 8080 --directory site` then open
`http://localhost:8080`.

## 11. Pre-flight checklist (mechanical, all must pass)

- [ ] Exactly one accent color anywhere on the page (orange).
- [ ] Orange body-size text never sits on cream (only `--accent-ink` does).
- [ ] Every CTA fits on one line at 1280 px and at 320 px.
- [ ] Exactly two CTA intents sitewide, identical wording per intent.
- [ ] Uppercase mono labels above headlines: count <= 3.
- [ ] >= 4 distinct section layout families; no 3 consecutive image+text splits.
- [ ] All animations are `transform`/`opacity` only (grep the CSS).
- [ ] No `addEventListener("scroll"` anywhere (grep the JS).
- [ ] Reduced-motion: toggle it in devtools; page is fully readable and static.
- [ ] 320 px wide: no horizontal scrollbar, hero cone <= 60vw.
- [ ] Every simulated/demo figure has its stamp (SIMULATED / DEMONSTRATION DATA).
- [ ] No forbidden phrases (grep: "guarantee", "ROI", "#1", "probability").
- [ ] No em dash characters in copy (grep for the character).
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
