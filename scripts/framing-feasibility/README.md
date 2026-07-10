# M34 Phase 0 — framing feasibility harness

Throwaway analysis scripts (D-086 §8). Not wired into the app. Protocol fixtures under `fixtures/framing/` stay after milestone close; these scripts may be deleted.

## Prerequisites

1. Dev Postgres with Insta360 (`i-57a09303f357`) and Heytea (`heytea-be18`) audit responses.
2. Active DeepSeek + OpenAI credentials in Settings that decrypt under the current `CREDENTIALS_ENCRYPTION_KEY` (C-11 — never pass keys on the CLI).
3. `CREDENTIALS_ENCRYPTION_KEY` set in `.env.local`.

## Run order

```bash
# 1. Organic lane — blind-extract stored discovery/consideration client mentions
pnpm framing:extract
# smoke: pnpm framing:extract -- --limit=2

# 2. Neutral lane — 6 representation prompts × 5 reps × DeepSeek+OpenAI on Insta360
pnpm framing:neutral
# cheaper smoke: pnpm framing:neutral -- --reps=2 --providers=deepseek
# resume after kill: re-run (checkpoints after every generation/extraction)

# 3. Analyze + GO/NO-GO + freeze protocol
pnpm framing:analyze
# without embedding spend: pnpm framing:analyze -- --skip-embed
```

## Outputs

| Path | What |
|---|---|
| `docs/audits/m34/organic-frames.json` | Organic blind extractions |
| `docs/audits/m34/neutral-generations.json` | Neutral mini-run raw answers |
| `docs/audits/m34/neutral-frames.json` | Neutral blind extractions |
| `docs/audits/m34/analysis.json` | Eligibility diagnostics |
| `docs/audits/m34/phase0-feasibility.md` | GO/NO-GO report |
| `fixtures/framing/framing-protocol.v1.json` | Frozen thresholds (on GO) |

## Gate

- **GO** if ≥1 real baseline is eligible under draft rules AND the synthetic unstable fixture abstains.
- **NO-GO** if zero real baselines pass — stop; do not auto-loosen thresholds; escalate.
