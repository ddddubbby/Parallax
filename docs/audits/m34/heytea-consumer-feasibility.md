# M34 — HEYTEA consumer organic-lane feasibility run

> Executed 2026-07-11 (Asia/Singapore). Status: **COMPLETE / DEVELOPMENT DATA**.
> This run repairs the invalid B2B-archetype dataset identified in D-095. It is not
> held-out validation, a frozen-v3 framing result, or permission to enforce C-15.

## Immutable run identity

| Field | Value |
|---|---|
| Project | `HEYTEA Consumer Feasibility` |
| Project ID | `d4a65f05-fca2-432b-a3be-39edd59410bd` |
| Preserved legacy project | `Heytea` — `e0435c68-c7b4-41b9-a7ac-f6a32c6e874b` (unchanged; invalid B2B feasibility source) |
| Archetype | `consumer_venue` |
| Market | Singapore |
| Personas | Gen Z Explorer; Young Professional |
| Matrix | V1, 30 cells, approved |
| Matrix version ID | `562b5396-3664-4fe0-a9ef-49040e50d924` |
| Run ID | `0241898e-d930-4ab7-b326-4760e5f86b3b` |
| Run mode | `live_audit` |
| Provider / mode | DeepSeek / ungrounded |
| Model returned | `deepseek-v4-flash` |
| Repetitions | k=5 per cell |
| Completion | 150/150 succeeded; 0 retryable; 0 dead-lettered; 0 skipped |
| Evidence extraction | 150/150 valid; 0 pending/retrying/dead-lettered |
| Run window | 2026-07-11 01:14–01:34 SGT |

## Spend

| Cost component | Actual |
|---|---:|
| Generation | $0.060138 |
| Evidence extraction | $0.109253 |
| Total | **$0.169391** |
| UI projection before launch | $0.0993 |
| Hard run cap | $2.00 |

The total was about 70.6% above the pre-run projection but only 8.5% of the hard
cap. This is an operational cost-estimation miss, not a methodological failure; it
should inform the queued C-2 projection/ledger work in D-096.

## Organic-lane feasibility result

Presence prompts were open and unbranded. HEYTEA appeared in 36/60 discovery and
consideration responses (dashboard mention rate 60.0%). At the pre-existing Phase-0
screen of at least 3 mentions in a five-completion cell, **8 of 12 cells qualify**:

- Discovery: 3/6 cells qualify; per-cell mentions = 3, 1, 3, 4, 2, 1.
- Consideration: 5/6 cells qualify; per-cell mentions = 2, 4, 4, 3, 4, 5.

This closes the narrow data-availability question: HEYTEA now supplies valid consumer
organic-lane development material with repeated spontaneous mentions. It does **not**
show that any framing is stable, eligible, representative, or actionable. Frame
extraction waits for the six D-096 instrument fixes and frozen v3; the invalid v2
instrument was deliberately not run over these responses.

## Input-quality intervention before approval

The first draft rendered four discovery prompts with the grammatical artifact
`for Choose ...`, caused by entering the buyer goal as an imperative. Before approval,
the buyer goal was rewritten as the noun phrase `an everyday tea or fruit-drink treat
or social occasion`, and all four affected cells were edited to natural, still-open
wording. The approved matrix contains no `for Choose` prompt.

## Disposition

- Keep this project/run as development data for the v3 organic-lane work.
- Keep the legacy HEYTEA project untouched as the audit trail for the D-095 exclusion.
- Do not call this a v3 pass and do not use it to validate thresholds.
- Do not run Crocs or Xiaomi until the gates in `heldout-register.md` are met.
