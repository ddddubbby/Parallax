-- M46/D-117: production upgrade for comparison template grammar.
-- Deployments run `pnpm db:migrate` but not `pnpm db:seed`; seed-only refresh
-- left existing DBs on client-first `{client_brand}` / `{competitor_list}` text
-- while new cells persisted a randomized `brand_order_json`. Idempotent: only
-- rows still containing the legacy competitor placeholder are rewritten.
-- Approved matrix cells remain byte-frozen (C-4).
UPDATE "prompt_templates"
SET
	"template_text" = CASE ("archetype"::text, "variant_key")
		WHEN ('b2b', 'v1') THEN 'Compare {brand_list} for a {persona} buyer in {market}.'
		WHEN ('b2b', 'v2') THEN 'How do {brand_list} stack up for {persona} teams in {market}?'
		WHEN ('b2b', 'v3') THEN 'Among {brand_list}, which fits a {persona} in {market} best, and why?'
		WHEN ('b2b', 'v4') THEN 'How does pricing compare among {brand_list} for a {persona} buyer in {market}?'
		WHEN ('b2b', 'v5') THEN 'What current deals or discounts make any of {brand_list} worth choosing for a {persona} buyer in {market}?'
		WHEN ('consumer_product', 'v1') THEN 'Compare {brand_list} for a {persona} in {market}.'
		WHEN ('consumer_product', 'v2') THEN 'How do {brand_list} compare for someone who cares about {attribute_list}?'
		WHEN ('consumer_product', 'v3') THEN 'Among {brand_list}, which would you pick for a {persona} in {market}, and why?'
		WHEN ('consumer_product', 'v4') THEN 'How does price compare among {brand_list} for a {persona} in {market}?'
		WHEN ('consumer_product', 'v5') THEN 'What deals or discounts make any of {brand_list} worth buying for a {persona} in {market}?'
		WHEN ('consumer_venue', 'v1') THEN 'Compare {brand_list} for a {persona} in {market}.'
		WHEN ('consumer_venue', 'v2') THEN 'How do {brand_list} compare for someone who cares about {attribute_list}?'
		WHEN ('consumer_venue', 'v3') THEN 'Among {brand_list}, where should a {persona} in {market} go, and why?'
		WHEN ('consumer_venue', 'v4') THEN 'How do prices compare among {brand_list} for a {persona} in {market}?'
		WHEN ('consumer_venue', 'v5') THEN 'What deals or specials make any of {brand_list} worth visiting for a {persona} in {market}?'
		ELSE "template_text"
	END,
	"updated_at" = now()
WHERE "intent" = 'comparison'
	AND "template_text" LIKE '%{competitor_list}%';
