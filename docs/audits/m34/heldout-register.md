# M34 v3 — Held-out consumer-brand register

> Pre-registered 2026-07-11. Status: **SELECTED / UNRUN**. These brands must not be
> used to design, tune, or debug framing-protocol.v3. No brand-targeted M34
> generation or extraction may begin until the v3 protocol and its implementation
> manifest are frozen.

## Selected brands

| Brand | Consumer archetype | Held-out role | Pre-registered method expectation |
|---|---|---|---|
| Crocs | `consumer_product` | Relatively clear identity; real-pass candidate | The frozen method must produce an eligible profile containing at least one stable identity concept. An abstention is scientifically acceptable but makes the Phase-0 gate NO-GO because no real held-out baseline passed. |
| Xiaomi | `consumer_product` | Genuinely fragmented identity | The method must preserve multiple identities or abstain when no concept dominates. It must not manufacture one dominant frame by merging strategically distinct categories. |

The expectations above test method behavior, not predetermined brand answers. No
exact frame label, prevalence, eligibility result, or commercially actionable gap is
specified in advance.

## Contamination boundary

- Insta360 remains development data and cannot validate v3.
- HEYTEA Consumer Feasibility is development/organic-lane feasibility data and
  cannot validate v3.
- Crocs and Xiaomi remain untouched held-outs until the frozen-v3 gate below is met.
- Incidental mention of either brand in unrelated category answers does not make it
  development data, but any brand-targeted prompt, extraction, coding, or inspection
  does.

## Gate before first held-out run

1. Freeze the v3 admission prompts, diagnostic prompts, decoding, concept mapping,
   review protocol, eligibility rules, and immutable run-manifest schema.
2. Pass positive, negative, polysemy, and over-merge controls through the real
   production-equivalent pipeline.
3. Complete the blinded human-coded instrument check and lock label mappings before
   scoring outcomes.
4. Use the same declared primary provider and generation mode for both held-out
   brands, with bounded live spend recorded before launch.
5. Treat any protocol or implementation change prompted by held-out results as v4;
   neither Crocs nor Xiaomi may then be reused as a v4 held-out brand.
6. Score the gate exactly as registered: Crocs must be eligible; Xiaomi must preserve
   multiple distinct stable identities or abstain without an over-merge; all four
   controls must pass. Held-out results never relax these conditions.

## Execution status

| Brand | Project created | Audit responses generated | M34 responses extracted | Status |
|---|---:|---:|---:|---|
| Crocs | No | No | No | Held-out — untouched |
| Xiaomi | No | No | No | Held-out — untouched |

## v4 carry-over addendum (2026-07-11, D-098)

`framing-protocol.v3` was rejected at its own development-data clause-sensitivity
gate (D-097) **before any held-out contact**. Per rule 5 above, held-outs burn only
when held-out *results* prompt a protocol change — that did not happen. **Crocs and
Xiaomi therefore carry over to framing-protocol.v4 as sealed held-outs**, with every
rule in this register applying to v4 exactly as written for v3 (read "v3" as "the
frozen protocol under test").

Option-B compatibility rule (D-098): ordinary Evidence-Layer audits of Crocs/Xiaomi
MAY be generated before v4 freezes, for descriptive/demo value. The framing pipeline
must not run on those responses and framing patterns must not be inspected before
freeze. Any such audit, and any access to its data, is recorded in the execution
table above (add rows/columns as needed — append-only).
