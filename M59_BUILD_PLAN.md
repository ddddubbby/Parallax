> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M59 research publishing, SK evidence and acceptance · TRACKER: STATUS.md

# M59 — Research that informs brand decisions

Approved brief: one SK article at /research/sk-jewellery-ai-visibility-message-test,
for brand marketing leaders. Include the measured visibility/perception audit,
AI recommendation experiment and separate Ethical sourcing Test A buyer responses.
Headline: AI knows SK Jewellery. What would make it recommend the brand?
No operator changes, database migration, new paid studies or invented results.

## Phases and acceptance

1. Evidence: enforced read-only database reader; completed runs, exact stimuli,
   baseline provenance, all six profiles and fourteen shopping scenarios; validate
   every public number and quote. Keep private raw snapshots outside the repository.
2. Research: migrate three legacy pages without content loss, preserve fragments,
   configure 301s, deterministic static generator, feed/sitemap/llms, article card.
   Acceptance: old content and links survive; build/check repeat identically.
3. Editorial: expose separate baselines and test types, full prompt disclosure,
   signed differences and limits; persona insights become specific proposed tests.
   Acceptance: observation, interpretation and action remain distinct; no positive
   lift promise; all model quotations attributed; public payload omits internal ids.
4. Verification: site Playwright, axe, no-JS, responsive 320–1440, card rendering,
   lint/typecheck/docs/diff; visual review and hosted redirects/canonicals.
5. Publication: reviewable preview, deploy verified site to windtunnel.tech under
   existing Vercel project; verify live routes, cards, security headers and indexing
   eligibility. Record external Search Console/Bing setup if inaccessible. Four-week
   review is a documented operator procedure, not an unsolicited scheduled job.

## Interface and publishing contract

content/research stores curated article JSON and a hash-bound verification receipt.
site:research discover/pull/verify use only read-only SQL and no operator imports;
build/check/lint work offline. build emits HTML, SVG/JPEG card, hub, feed, sitemap,
llms and social Markdown. A changed article must be reverified before build.
Only curated text and aggregate evidence render publicly; raw packs never deploy.
All figures retain population, dates, model/API route, uncertainty and evidence class.
The measured/simulated separation and directional slices are mandatory.

## Editorial acceptance

Primary takeaway: presence is strong in the sampled questions; no clear overall
recommendation improvement was established. Pair sourcing evidence with a specific
purchase decision in the next test. Different baselines, unequal message lengths,
small synthetic profiles, prompted needs, ungrounded API outputs and sampling
uncertainty prevent broader causal or human-outcome claims.
