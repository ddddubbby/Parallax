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

    // Independent SQL: latest extraction per response, eligible (valid/qa_reviewed,
    // refusal:false, D-014), joined to that response's client-brand mention row if
    // one exists. D-054 frame rule encoded independently: mention/recommendation
    // rates count only unbranded intents (discovery, consideration); the
    // comparative win rate counts only comparison cells.
    const spotCheck = await db.execute<{
      n_unbranded: number;
      client_mentions: number;
      client_recommended: number;
      n_comparison: number;
      comparison_wins: number;
    }>(sql`
      with latest_ext as (
        select distinct on (response_id) id, response_id, state, extracted_json
        from extractions
        order by response_id, extraction_version desc
      ),
      eligible as (
        select r.id as response_id, le.id as extraction_id, pc.intent
        from responses r
        join latest_ext le on le.response_id = r.id
        join prompt_cells pc on pc.id = r.cell_id
        where r.run_id = ${run.id}
          and le.state in ('valid', 'qa_reviewed')
          and coalesce((le.extracted_json->>'refusal')::boolean, false) = false
      )
      select
        count(*) filter (where e.intent in ('discovery','consideration'))::int as n_unbranded,
        count(bm.id) filter (where e.intent in ('discovery','consideration'))::int as client_mentions,
        count(*) filter (where e.intent in ('discovery','consideration') and bm.recommended)::int as client_recommended,
        count(*) filter (where e.intent = 'comparison')::int as n_comparison,
        count(*) filter (where e.intent = 'comparison' and bm.recommended)::int as comparison_wins
      from eligible e
      left join brand_mentions bm on bm.extraction_id = e.extraction_id and bm.brand_id = ${clientBrand.id}
    `);
    const { n_unbranded, client_mentions, client_recommended, n_comparison, comparison_wins } = spotCheck.rows[0];
    expect(n_unbranded).toBeGreaterThan(0);
    expect(n_comparison).toBeGreaterThan(0);

    const persistedMentionRate = overall("mention_rate");
    const persistedRecommendationRate = overall("recommendation_rate");
    const persistedComparativeWinRate = overall("comparative_win_rate");
    expect(persistedMentionRate?.n).toBe(n_unbranded);
    expect(persistedMentionRate?.value).toBeCloseTo(client_mentions / n_unbranded, 6);
    expect(persistedRecommendationRate?.n).toBe(n_unbranded);
    expect(persistedRecommendationRate?.value).toBeCloseTo(client_recommended / n_unbranded, 6);
    expect(persistedComparativeWinRate?.n).toBe(n_comparison);
    expect(persistedComparativeWinRate?.value).toBeCloseTo(comparison_wins / n_comparison, 6);

    // Third spot-check: Citation Share, independently summed from the
    // resolved extracted_json (D-031). D-054: grounded, unbranded samples
    // only — if the run has none, the metric row must not exist at all.
    const citationCheck = await db.execute<{ n_samples: number; client_citations: number; tracked_citations: number }>(sql`
      with latest_ext as (
        select distinct on (response_id) id, response_id, state, extracted_json
        from extractions
        order by response_id, extraction_version desc
      ),
      eligible as (
        select le.extracted_json
        from responses r
        join latest_ext le on le.response_id = r.id
        join prompt_cells pc on pc.id = r.cell_id
        where r.run_id = ${run.id}
          and r.generation_mode = 'grounded'
          and pc.intent in ('discovery','consideration')
          and le.state in ('valid', 'qa_reviewed')
          and coalesce((le.extracted_json->>'refusal')::boolean, false) = false
      ),
      citations as (
        select jsonb_array_elements(extracted_json->'citations') as c from eligible
      )
      select
        (select count(*) from eligible)::int as n_samples,
        count(*) filter (where c->'cited_for_brand_ids' ? ${clientBrand.id})::int as client_citations,
        count(*) filter (where jsonb_array_length(c->'cited_for_brand_ids') > 0)::int as tracked_citations
      from citations
    `);
    const { n_samples, client_citations, tracked_citations } = citationCheck.rows[0];
    const persistedCitationShare = overall("citation_share");
    if (n_samples === 0) {
      expect(persistedCitationShare).toBeUndefined();
    } else {
      const sqlCitationShare = tracked_citations === 0 ? 0 : client_citations / tracked_citations;
      expect(persistedCitationShare?.value).toBeCloseTo(sqlCitationShare, 6);
      expect(persistedCitationShare?.n).toBe(n_samples);
    }

    // CS-5: per-brand scope (CS-1). Independent SQL derives each tracked
    // brand's unbranded mention rate (D-054 frame) and asserts it matches the
    // persisted brand-scope row; also checks all brands' share_of_voice sums
    // to 1 (each brand's slice of unbranded tracked mentions).
    const brandCheck = await db.execute<{ brand_id: string; mentions: number; n_unbranded: number }>(sql`
      with latest_ext as (
        select distinct on (response_id) id, response_id, state, extracted_json from extractions order by response_id, extraction_version desc
      ),
      eligible as (
        select le.id as extraction_id, pc.intent
        from responses r
        join latest_ext le on le.response_id = r.id
        join prompt_cells pc on pc.id = r.cell_id
        where r.run_id = ${run.id}
          and le.state in ('valid','qa_reviewed')
          and coalesce((le.extracted_json->>'refusal')::boolean, false) = false
      ),
      unbranded as (select * from eligible where intent in ('discovery','consideration'))
      select b.id::text as brand_id,
             count(bm.id)::int as mentions,
             (select count(*) from unbranded)::int as n_unbranded
      from brands b
      left join brand_mentions bm on bm.brand_id = b.id
        and bm.extraction_id in (select extraction_id from unbranded)
      where b.project_id = ${project.id}
      group by b.id
    `);
    const brandRows = await listMetrics(run.id);
    const brandMetric = (brandId: string, key: string) =>
      brandRows.find((m) => m.scopeType === "brand" && m.scopeKey === brandId && m.metricKey === key);
    let shareSum = 0;
    for (const { brand_id, mentions, n_unbranded } of brandCheck.rows) {
      if (n_unbranded === 0) continue;
      const mr = brandMetric(brand_id, "mention_rate");
      expect(mr?.n).toBe(n_unbranded);
      expect(mr?.value).toBeCloseTo(mentions / n_unbranded, 6);
      shareSum += brandMetric(brand_id, "share_of_voice")?.value ?? 0;
    }
    if (brandCheck.rows.some((r) => r.mentions > 0)) {
      expect(shareSum).toBeCloseTo(1, 6);
    }

    await pool.end();
  }, 30_000);
});
