import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { recomputeMetrics, listMetrics } from "@/db/repositories/metrics";
import { auditRuns, brands, projects } from "@/db/schema";

// M6 acceptance (DEVELOPMENT_GUIDELINES.md F manual checklist row):
// "Dashboard: three figures spot-checked against SQL." Automated here
// rather than manual — independently derives Mention Rate, Recommendation
// Rate, and Citation Share via hand-written SQL against the raw tables and
// asserts they match the persisted `metrics` rows exactly. Runs against
// the M4 e2e project's real 500-response run; self-skips without Postgres.
let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("dashboard figures match independent SQL spot-checks", () => {
  it("Mention Rate, Recommendation Rate, and Citation Share match hand-written SQL", async () => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, "m4-e2e"));
    expect(project, "m4-e2e project must exist — run pnpm test:mock-e2e first").toBeDefined();

    const [clientBrand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.projectId, project.id));
    const [run] = await db
      .select({ id: auditRuns.id })
      .from(auditRuns)
      .where(eq(auditRuns.projectId, project.id))
      .orderBy(sql`created_at desc`)
      .limit(1);
    expect(run).toBeDefined();

    await recomputeMetrics(run.id);
    const persisted = await listMetrics(run.id);
    const overall = (key: string) => persisted.find((m) => m.scopeType === "overall" && m.metricKey === key);

    // Independent SQL: latest extraction per response, eligible (valid/qa_reviewed, refusal:false, D-014),
    // joined to that response's client-brand mention row if one exists.
    const spotCheck = await db.execute<{
      n: number;
      client_mentions: number;
      client_recommended: number;
    }>(sql`
      with latest_ext as (
        select distinct on (response_id) id, response_id, state, extracted_json
        from extractions
        order by response_id, extraction_version desc
      ),
      eligible as (
        select r.id as response_id, le.id as extraction_id
        from responses r
        join latest_ext le on le.response_id = r.id
        where r.run_id = ${run.id}
          and le.state in ('valid', 'qa_reviewed')
          and coalesce((le.extracted_json->>'refusal')::boolean, false) = false
      )
      select
        count(*)::int as n,
        count(bm.id)::int as client_mentions,
        count(*) filter (where bm.recommended)::int as client_recommended
      from eligible e
      left join brand_mentions bm on bm.extraction_id = e.extraction_id and bm.brand_id = ${clientBrand.id}
    `);
    const { n, client_mentions, client_recommended } = spotCheck.rows[0];
    expect(n).toBeGreaterThan(0);

    const sqlMentionRate = client_mentions / n;
    const sqlRecommendationRate = client_recommended / n;

    const persistedMentionRate = overall("mention_rate");
    const persistedRecommendationRate = overall("recommendation_rate");
    expect(persistedMentionRate?.n).toBe(n);
    expect(persistedMentionRate?.value).toBeCloseTo(sqlMentionRate, 6);
    expect(persistedRecommendationRate?.n).toBe(n);
    expect(persistedRecommendationRate?.value).toBeCloseTo(sqlRecommendationRate, 6);

    // Third spot-check: Citation Share, independently summed from the
    // resolved extracted_json (D-031) rather than a joined table.
    const citationCheck = await db.execute<{ client_citations: number; tracked_citations: number }>(sql`
      with latest_ext as (
        select distinct on (response_id) id, response_id, state, extracted_json
        from extractions
        order by response_id, extraction_version desc
      ),
      eligible as (
        select le.extracted_json
        from responses r
        join latest_ext le on le.response_id = r.id
        where r.run_id = ${run.id}
          and le.state in ('valid', 'qa_reviewed')
          and coalesce((le.extracted_json->>'refusal')::boolean, false) = false
      ),
      citations as (
        select jsonb_array_elements(extracted_json->'citations') as c from eligible
      )
      select
        count(*) filter (where c->'cited_for_brand_ids' ? ${clientBrand.id})::int as client_citations,
        count(*) filter (where jsonb_array_length(c->'cited_for_brand_ids') > 0)::int as tracked_citations
      from citations
    `);
    const { client_citations, tracked_citations } = citationCheck.rows[0];
    const sqlCitationShare = tracked_citations === 0 ? 0 : client_citations / tracked_citations;

    const persistedCitationShare = overall("citation_share");
    expect(persistedCitationShare?.value).toBeCloseTo(sqlCitationShare, 6);

    await pool.end();
  }, 30_000);
});
