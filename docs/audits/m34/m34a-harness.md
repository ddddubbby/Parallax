# M34A workflow harness

This is the development/workflow harness for D-099's **human-reviewed framing
evidence**. It is not a production worker, schema, eligibility engine, or
simulation-approval path.

## Order of operations

1. Collect the adopted bare representation prompts with an explicit run cap.
2. Build a blind discovery packet. The packet contains response text only; its
   response-id key is separate.
3. The analyst creates a project-specific codebook from the blind packet.
4. Lock the codebook before full-sample coding, then record the positioning and
   fact-sheet reveal timestamp.
5. Human-review each full-sample code. Span assist may propose offsets, but a
   failed assist never blocks raw-text review.
6. Generate the descriptive recurrence matrix and, after reveal, the gap
   report. A Simulation handoff creates a copied C-15 evidence snapshot.

## Commands

```sh
pnpm framing:m34a:collect -- --project=insta360 --provider=deepseek \
  --run-id=insta360-m34a-dev-YYYYMMDD --reps=5 --cap-usd=5

pnpm framing:m34a:workflow -- packet --study=docs/audits/m34/m34a-<run-id>.json \
  --packet-id=<id> --shuffle-seed=<recorded-seed>

pnpm framing:m34a:workflow -- lock --draft=<codebook-draft.json> --locked-at=<ISO-8601>

pnpm framing:m34a:workflow -- matrix --study=<study.json> --codebook=<locked-codebook.json> \
  --coding=<coding-record.json>

pnpm framing:m34a:report -- --study=<study.json> --codebook=<locked-codebook.json> \
  --coding=<coding-record.json> --reveal=<positioning-reveal.json> --gaps=<gap-classifications.json>
```

`fixtures/framing/m34a-*.example.json` form a synthetic, no-spend example.
They document the input shapes; they are not client evidence.

## Integrity notes

- The adopted prompt wording in `representation-prompts.v4.json` is pinned.
- `docs/audits/m34/*.json` is gitignored: raw model-origin responses and local
  review records stay local. Commit only SHA-256 manifest entries and reports
  deliberately cleared for the repository.
- The harness ledger reserves an estimated amount before every paid call and
  settles actual cost after success; a failed call remains reserved.
- Recurrence is descriptive `n/N` evidence. Never render it as an interval,
  synthetic respondent count, eligibility verdict, or population estimate.
