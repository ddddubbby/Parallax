> LIFECYCLE: ACTIVE · ROLE: CANON · OWNS: visual language — tokens, typography, surfaces, motion, guardrails V-1..V-13

# DESIGN_GUIDELINES.md - Resonance Visual Language

> How Resonance looks, moves, and speaks across Evidence and Message Lift surfaces. Architecture and code rules live in `DEVELOPMENT_GUIDELINES.md`; scope lives in `PRD.md`. Where a visual choice conflicts with a hard constraint in `MASTER_CONTEXT.md` section 4, the constraint wins.

---

## 1. Aesthetic thesis

Resonance looks like a **machine-age evidence dossier**: the terminal, industrial-editorial language of Bitkey and "Machine Age Modernism" applied to a measurement instrument. Every screen should feel like a numbered field document produced by a precise machine — monospace metadata, ink-on-paper contrast, one signal-orange accent, geometric solidity, and silk-smooth restrained motion.

This is deliberate product fit, not decoration: the product sells statistical honesty and preserved evidence. A dossier aesthetic — dates, run numbers, stamps, uppercase labels — makes the evidence-chain identity visible in the UI itself. The dossier discipline is exactly why the simulation layer fits without softening the differentiator: a `SIMULATED` stamp is a native dossier element, and marking simulated evidence as plainly as measured evidence (C-12) is the aesthetic doing its job, not a compromise of it.

The operator's taste anchors: cyberpunk-adjacent but refined (terminal type and dark chrome, never neon clutter), Bitcoin-native (signal orange, hard-money sobriety), and visually smooth (eased motion, matte depth, no gloss).

## 2. Design tenets

1. **Ink and paper, one signal.** Two surfaces (near-black ink, warm paper) and exactly one accent orange. If a screen needs a second accent, the layout is wrong. Amendment (D-055): four muted structural tints (`--color-pillar-*`) exist for Four-P pillar identity only — section spines, numbered headers, chips. They are ruled ink, not accents: never on actions, verdicts, severity, or emphasis (V-2 unchanged). Amendment (D-063, updated D-077): funnel-stage chips (`EVIDENCE LAYER`/`TRUST RAIL`/`SIMULATION LAYER`) and the `SIMULATED` badge are structural stamps in the existing badge family (2px mono uppercase, ink-outlined) — they introduce no new accent or color. The lower funnel does NOT get its own color identity; it is distinguished by the `SIMULATED` stamp and dossier framing, not by hue.
2. **Monospace is the voice of the machine.** Data, labels, metadata, and headings speak in mono. Long-form prose speaks in a quiet sans. Serif display appears only at editorial moments.
3. **Dossier framing.** Screens and cards carry document metadata: run numbers, dates, sample counts, mode stamps. `RUN 014 / MOCK / K=5 / 2026.07.02` is a design element, not debug output.
4. **Geometry over illustration.** Faceted solids, dot-matrix glyphs, blueprint grids. No mascots, no stock art, no gradients-as-decoration.
5. **Silk over spring.** Motion is short, eased, and purposeful. Nothing bounces. Nothing autoplays on data surfaces.
6. **Evidence outranks aesthetics.** Badges, confidence intervals, and small-n guards are never restyled into invisibility. Legibility of numbers beats every visual flourish.

## 3. Color tokens

All colors exist once, as CSS variables in the global token file. No raw hex anywhere else (V-10).

| Token | Value | Role |
|---|---|---|
| `--ink` | `#0E0E0C` | Dark surface, primary text on paper |
| `--ink-2` | `#1C1C18` | Raised dark surface (cards on ink) |
| `--paper` | `#F0EEE4` | Light surface, primary text on ink |
| `--paper-2` | `#E6E3D6` | Recessed light surface (wells, table stripes) |
| `--accent` | `#F15A24` | Signal orange: primary actions, selection, client brand |
| `--accent-ink` | `#7A2A0E` | Accent text/border on paper where AA contrast requires |
| `--ok` | `#1E7A4F` | Supported claims, healthy states |
| `--danger` | `#B3261E` | Contradicted claims, high severity, destructive actions |
| `--warn` | `#8A6400` | Outdated/unsupported claims, degraded states |
| `--muted` | ink/paper at 55% alpha | Secondary text |
| `--line` | ink/paper at 14% alpha | Hairline borders, dividers, grids |

Usage rules:

- Accent orange means **action, selection, or the client brand** — never a verdict, never severity, never destruction. Semantic meaning belongs to `--ok`/`--danger`/`--warn` exclusively.
- The signal orange sits deliberately between Bitkey's coral and Bitcoin orange (`#F7931A`); tune within that band only, and only by editing the token.
- Neutrals are warm (derived from ink/paper alphas), never cool blue-grays.
- Competitor brands in charts use stepped ink alphas; the client brand alone gets accent.

## 4. Typography

| Role | Face | Rules |
|---|---|---|
| UI mono (default voice) | IBM Plex Mono | Labels, headings, buttons, table data, metadata. Uppercase + `letter-spacing: 0.08em` for labels and section headings |
| Body sans | Inter | Paragraphs, descriptions, form help. Never uppercase |
| Display serif | Instrument Serif | Report title pages, dashboard hero numbers, empty-state headlines only |

Rules:

- Loaded via `next/font`, self-hosted; exactly these three families (V-9).
- Numbers are always mono with `font-variant-numeric: tabular-nums` — metrics must align vertically in tables.
- Uppercase mono is for short strings (≤6 words). Body copy is never uppercase, never mono.
- Base body size 14px/1.5 on data surfaces, 16px/1.6 for report prose. Nothing interactive below 12px.
- Big-type moments (dashboard scorecard, report cover) may use oversized mono or serif with tight leading, echoing the Bitkey hero — but only one per screen.

## 5. Geometry, iconography, texture

- **Radius scale:** interactive chips and buttons are full pills (`9999px`); cards and panels `12px`; inputs `8px`; badges and stamps `2px` (near-sharp, like a printed block). The pill-vs-stamp contrast is the signature: soft controls, hard evidence.
- **Icons:** dot-matrix/pixel-grid glyphs for section identity marks (project, run, report — like Bitkey's hub icons). Functional icons use Lucide (ships with shadcn/ui) at 1.5px stroke. Never mix the two roles.
- **The faceted-hex motif** (Bitkey hardware silhouette) is reserved for brand moments: login screen, empty states, report cover. Never on working data surfaces.
- **Blueprint grid:** faint 1px `--line` grid (24px cell) may back ink-surface hero and empty states, echoing the 3D-shapes reference.
- **Speckle/grain texture:** ≤4% opacity, ink surfaces only, never behind text, never on chart canvases.
- Depth comes from surface steps (`--ink` vs `--ink-2`) and hairlines, not shadows. One soft shadow tier exists for overlays/popovers only.

## 6. Surfaces: the dual-theme strategy

The product is not globally dark or light. It has two named surfaces used by role:

- **Ink (dark):** app chrome — top nav, auth screen, Debug console, run-progress live view, empty states. The cyberpunk register lives here.
- **Paper (light):** the workbench — wizard, matrix editor, dashboard, claim review, report builder. Dense reading and QA happen on paper because that's where legibility wins.

Rules:

- A screen is one surface; no half-dark/half-light layouts. The nav bar is always ink, floating over either surface as pill-shaped chips (Bitkey nav pattern).
- Report preview and every export are **paper only**, styled conservatively (serif + mono, no chrome, no texture) per the client-facing tone rule RB-5.
- No user-facing theme toggle in MVP; the surface-per-role assignment is fixed.

## 7. Motion

Silk-smooth means fast, eased, and rare:

- Micro (hover, press, focus): 140ms. Standard (panels, accordions, dropdowns): 220ms. Large (route transitions, drawer slide): 320ms max.
- One easing everywhere: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint feel). No bounce, no spring, no overshoot.
- Animate `transform` and `opacity` only. Never animate layout properties on data tables.
- Live-run views may use a subtle pulse on the active job row and a smooth count-up (≤600ms, once) on completed metrics. Charts animate in once on mount and never re-animate on data refresh.
- `prefers-reduced-motion` collapses everything to opacity fades ≤100ms.

## 8. Component rules

- **Nav:** ink pill chips with the paired-tab notch look; active state is a paper chip. Cart-corner slot holds the run-cost live meter.
- **Buttons:** primary = accent pill, mono uppercase label; secondary = outlined pill on current surface; destructive = `--danger` outline that fills on hover, always with a confirm step. Arrow-in-pill prefix for "learn more"-style secondary actions.
- **Badges/stamps** (`MOCK`, `VALIDATION-ONLY`, `UNGROUNDED`, `PARTIAL`, `DIRECTIONAL`, `DEAD-LETTER`, `SIMULATED`, `GENERIC`): 2px-radius mono uppercase stamps. `MOCK` is always accent-filled; state stamps are ink-outlined; severity stamps use semantic colors. `SIMULATED` is ink-outlined like the other state stamps (never accent-filled — it marks epistemic status, not emphasis); `GENERIC` marks an unconditioned resonance study (C-13). Reserved styles — see V-1.
- **Cards:** metadata header row (mono, muted, uppercase) above content, like a labeled specimen. Cards on paper get `--line` hairlines; on ink they step to `--ink-2`.
- **Tables:** the workhorse. Mono tabular numerals, `--paper-2` row stripes, sticky headers, row hover = accent hairline on the left edge. Drill-down affordance is an arrow-pill on the row end (supports the ≤2-click evidence rule DB-2).
- **Wizard:** progress rail as numbered mono stops (`01 BRAND`, `02 COMPETITORS`…), completed stops get a dot-matrix check. Autosave indicator is a quiet mono timestamp (`SAVED 14:02:11`), never a toast.
- **Forms:** 8px-radius fields, hairline borders, accent focus ring; field-level Zod errors in `--danger` mono beneath the field. No placeholder-as-label.
- **Dashboard:** scorecard numbers oversized mono with CI ranges rendered directly beneath in muted mono (`0.42 [0.31–0.54]`). "Insufficient data" states use the dot-matrix glyph + mono explanation, not grayed-out fake charts.
- **Loading states:** route- and panel-level loading surfaces speak dossier, not skeleton — a quiet mono placeholder line (`LOADING RUN 014…`) or the dot-matrix glyph, never generic gray `animate-pulse` blocks. Same law as the empty-state rule above: no grayed-out fake content (D-105).
- **Debug console:** the one full-terminal surface — ink, mono everything, `run_events` as a tailing log with level-colored stamps.

## 9. Data visualization

- Recharts, styled exclusively inside `/src/components` wrappers (C1.6); chart code never hardcodes colors.
- Ink-on-paper monochrome bars/lines; client brand series in accent; competitors in stepped ink alphas. No categorical rainbow palettes.
- Wilson CI whiskers or bands are part of the chart spec, not optional decoration — a rate without its interval doesn't ship (supports the statistical-honesty identity).
- Chart canvases are flat: no gridlines heavier than `--line`, no 3D, no texture, no animation on refresh.
- Every figure carries its dossier caption: scope, n, mode stamps.

## 10. Voice and microcopy

- Labels are machine-voice: terse, uppercase mono, metadata-shaped. Dates render as `2026.07.02`; identifiers as `RUN 014`, `CELL C-23`.
- Body copy is human-voice: plain sentences, sentence case, no hype. UI copy never promises rankings or guaranteed outcomes — the RB-5 report-tone rule applies to the whole product.
- Numbers are shown with their uncertainty or their n, or they're not shown.
- Empty states teach in one sentence, dossier-framed: `NO RUNS ON FILE — approve a matrix to begin.`

## 11. Hard guardrails

| ID | Rule |
|---|---|
| V-1 | Badge styles for `MOCK`, `VALIDATION-ONLY`, `UNGROUNDED`, `PARTIAL`, `DIRECTIONAL`, `SIMULATED`, `GENERIC` are reserved: minimum 12px mono uppercase, AA contrast, never hidden, shrunk, or restyled per-view. They exist to enforce C-9, D-008, D-015, and C-12/C-13 visually. `SIMULATED` in particular appears on every lower-funnel surface and export and is never suppressed to make a simulation read as measurement. Reserved stamps render only through the shared `Stamp` component (`src/components/ui.tsx`) — never re-implemented per view (D-105). |
| V-2 | Accent orange never encodes verdicts, severity, or destruction. Semantic colors never appear in non-semantic decoration. |
| V-3 | Metric text, CI ranges, and table numerals meet 4.5:1 contrast on their surface. Muted text is for labels, never for values. |
| V-4 | Client-facing report preview and all exports are paper-surface, texture-free, and conservatively styled. The cyberpunk register is operator-only. |
| V-5 | No decoration on chart canvases: no texture, grids beyond hairlines, 3D, or refresh animation. |
| V-6 | Motion obeys section 7 budgets and `prefers-reduced-motion`. Nothing loops indefinitely except the live-run pulse, which stops with the run. |
| V-7 | Effects are CSS/SVG only. No WebGL, no canvas-rendered 3D, no runtime-generated noise. Hero geometry ships as static assets. Chrome desktop first (PRD scope); nothing may *break* at 1280px. |
| V-8 | Every interactive element has a visible accent focus ring; wizard, tables, and claim review are fully keyboard-operable. |
| V-9 | Exactly three font families (section 4), self-hosted via `next/font`. No additional weights or faces without a Decision Log entry. |
| V-10 | All color, radius, spacing, and motion values live as tokens in the global CSS variable file consumed by Tailwind/shadcn. A raw hex or ad-hoc duration in a component is a review-blocking defect. |
| V-11 | Legibility beats vibe: body ≥14px/1.5, uppercase only for short labels, no mono paragraphs, no text over texture. |
| V-12 | Aesthetic changes follow A3 surgical-change rules — restyling a component is its own diff, never a rider on a feature diff. |
| V-13 | The generic-AI-default vocabulary is banned and sits at zero occurrences in `src/`; it stays at zero: decorative multi-hue gradients (backgrounds, buttons, or clipped headline text), stock framework semantic-palette utilities (blue-info / amber-tip / green-success / red-error), backdrop-blur/glassmorphism surfaces, decorative emoji in chrome, pulsing or glowing status dots, decorative badge pills, and mascot/blob SVG marks. Any occurrence in a diff is a review-blocking defect, same weight as V-10's raw hex. The mono/pill/dossier register itself is exempt — it is this product's chosen, defended system (§1, D-019/D-055), not a default (D-105). |

## 12. Implementation notes

- Tokens: define section 3/5/7 values as CSS variables in `src/app/globals.css`; map them into Tailwind theme and shadcn/ui theme variables. shadcn components are themed via tokens, not forked.
- Fonts: IBM Plex Mono, Inter, Instrument Serif via `next/font` (self-hosted; all have permissive licenses).
- Print CSS for the report export is part of the report module and follows V-4, with section page breaks per EX-2.
- When a visual and a functional requirement collide, file it as a decision — do not resolve it silently in component code.

## 13. What this is not

Not neon-on-black cyberpunk clutter, not glassmorphism, not gradient-mesh SaaS, not Bloomberg-terminal density for its own sake, and not a Bitkey clone — it borrows Bitkey's discipline (duotone, mono, one accent, geometric restraint), not its marketing layouts. When in doubt, remove the effect and let the typography and the numbers carry the screen.
