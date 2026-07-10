/**
 * One-shot probe: list B2C projects and organic-mention density for Phase 0.
 * Not part of the frozen harness — delete with other feasibility scratch if desired.
 */
import "../../src/env-bootstrap";
import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client";

async function main() {
  const projects = await db.execute(sql`
    SELECT p.id, p.name, p.slug, p.category, p.category_archetype AS archetype,
      COUNT(DISTINCT ar.id) AS runs,
      COUNT(r.id) AS responses
    FROM projects p
    LEFT JOIN audit_runs ar ON ar.project_id = p.id
    LEFT JOIN responses r ON r.run_id = ar.id
    GROUP BY p.id
    ORDER BY responses DESC
    LIMIT 30
  `);
  console.log("=== projects ===");
  console.log(JSON.stringify(projects.rows, null, 2));

  const organic = await db.execute(sql`
    SELECT p.name AS project, p.slug, p.category_archetype AS archetype,
      pc.intent, r.provider_id, r.generation_mode, mv.kind AS matrix_kind,
      COUNT(DISTINCT r.id) AS responses_with_client_mention,
      COUNT(DISTINCT pc.id) AS cells
    FROM projects p
    JOIN brands b ON b.project_id = p.id AND b.role = 'client'
    JOIN audit_runs ar ON ar.project_id = p.id
    JOIN matrix_versions mv ON mv.id = ar.matrix_version_id
    JOIN responses r ON r.run_id = ar.id
    JOIN extractions e ON e.response_id = r.id AND e.state = 'valid'
    JOIN brand_mentions bm ON bm.extraction_id = e.id AND bm.brand_id = b.id
    JOIN prompt_cells pc ON pc.id = r.cell_id
    WHERE pc.intent IN ('discovery', 'consideration')
      AND p.slug IN ('i-57a09303f357', 'heytea-be18')
    GROUP BY p.name, p.slug, p.category_archetype, pc.intent, r.provider_id, r.generation_mode, mv.kind
    ORDER BY responses_with_client_mention DESC
  `);
  console.log("=== organic client mentions (discovery/consideration) ===");
  console.log(JSON.stringify(organic.rows, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
