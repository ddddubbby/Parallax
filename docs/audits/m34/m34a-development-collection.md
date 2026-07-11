# M34A development collection

> 2026-07-11. These are workflow-development inputs for M34A human-reviewed
> framing evidence. They do not validate an automated ontology or produce a
> client-facing association claim before blinded coding is complete.

## Collection protocol

- Primary lane: `neutral_elicited`; prompts: adopted, bare
  `representation-prompts.v4`; provider/mode: DeepSeek / ungrounded.
- Five prompt variants × five repetitions per brand: 25 denominator responses
  per development study.
- Raw response, literal prompt, model version, timestamp, mode, and source
  hash are stored in the ignored local artifact. The v4 offset extractor was
  assistive only; human raw-text review remains required.
- The M34A harness ledger reserved spend before each provider call and retained
  an unsettled reservation rather than guessing that an interrupted call was
  free.

## Resulting evidence material

| Development study | Denominator | Stored raw responses | Span-assist record | Known cost | Conservatively reserved spend |
|---|---:|---:|---|---:|---:|
| Insta360 | 25 | 25 | 22 `ok`, 3 `malformed` | $0.0777 | $0.0787 |
| HEYTEA | 25 | 24 | 13 `ok`, 1 `malformed`, 10 `not_requested` | $0.0399 | $0.1399 |

HEYTEA has one `generation_unavailable` entry (`a3`, repetition 5): a call
reservation existed without a checkpointed raw response. It is retained in
the descriptive denominator, never silently retried, and cannot appear in a
blind packet, coded association, or Simulation handoff.

## Blinding status

Two 10-response discovery packets were built, each with a separate response-id
key. Packet inspection confirmed absence of `responseId`, provider, and prompt
variant metadata. Neither packet contains the client positioning, desired
attributes, fact sheet, response frequencies, or Simulation candidates.

## Next workflow step

A human analyst must create a small project-specific codebook from each blind
packet, lock and timestamp it, then record the positioning/fact-sheet reveal
before full-sample coding. No association, recurrence matrix, gap
classification, or Simulation baseline has yet been created.
