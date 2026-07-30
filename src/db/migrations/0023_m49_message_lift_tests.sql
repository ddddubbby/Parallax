-- M49/D-119: add a second Message Lift test without changing the frozen
-- audit/resonance matrix wall or historical prompt cells.
ALTER TABLE "resonance_studies"
	ADD COLUMN "test_type" text DEFAULT 'buyer_response' NOT NULL,
	ADD COLUMN "recommendation_scenarios_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	ADD COLUMN "prompt_protocol_version" text;

ALTER TABLE "resonance_studies"
	ADD CONSTRAINT "resonance_studies_test_type_ck"
	CHECK ("test_type" IN ('buyer_response', 'ai_recommendation'));
