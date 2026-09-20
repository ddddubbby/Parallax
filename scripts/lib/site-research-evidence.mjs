// Publication verification must never call the app's recomputing export route.
// Explicit columns only: credentials, costs, tokens and operational logs stay private.
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

export async function readEvidence(work) {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; no fallback database');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
    application_name: 'windtunnel-research-read-only',
    options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await work(client);
    await client.query('ROLLBACK');
    return result;
  } finally { await client.end(); }
}

export async function discoverRuns(client, brand) {
  return (await client.query(`select r.id, p.name, r.state, r.run_mode, r.repetitions,
    r.completed_at, m.kind, s.name as study_name, s.test_type
    from audit_runs r join projects p on p.id=r.project_id
    join matrix_versions m on m.id=r.matrix_version_id
    left join resonance_studies s on s.id=m.resonance_study_id
    where p.name ilike $1 or exists (select 1 from brands b where b.project_id=p.id and b.name ilike $1)
    order by r.created_at`, [`%${brand}%`])).rows;
}

export async function pullRun(client, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('A run UUID is required');
  const run = (await client.query(`select r.id, r.project_id, r.matrix_version_id, r.state,
    r.run_mode, r.repetitions, r.selected_providers_json, r.selected_modes_json,
    r.planned_calls, r.completed_at, m.kind, m.resonance_study_id
    from audit_runs r join matrix_versions m on m.id=r.matrix_version_id where r.id=$1`, [id])).rows[0];
  if (!run) throw new Error('Run not found');
  const query = async (sql, params) => (await client.query(sql, params)).rows;
  const metrics = await query(`select scope_type, scope_key, metric_key, value, n, ci_low, ci_high, metadata_json
    from metrics where run_id=$1 order by scope_type, scope_key, metric_key`, [id]);
  const cells = await query(`select id, intent, persona_id, panel_persona_key, stimulus_id, variant_key, resolved_text
    from prompt_cells where matrix_version_id=$1 order by created_at, id`, [run.matrix_version_id]);
  const samples = await query(`select r.id, r.cell_id, r.provider_id, r.generation_mode, r.model_version,
    r.raw_text, r.created_at, j.rep_index, e.state as extraction_state, e.extracted_json
    from responses r join jobs j on j.id=r.job_id
    left join lateral (select state, extracted_json from extractions where response_id=r.id
      order by extraction_version desc limit 1) e on true
    where r.run_id=$1 order by r.cell_id, j.rep_index`, [id]);
  const brands = await query('select id, name, role, description from brands where project_id=$1 order by priority, name', [run.project_id]);
  const facts = await query('select statement, source_url, source_note, status from fact_claims where project_id=$1', [run.project_id]);
  const attributes = await query('select id, name from attributes where project_id=$1 order by priority, name', [run.project_id]);
  const study = run.resonance_study_id ? (await query(`select id, name, state, test_type, panel_personas_json,
    recommendation_scenarios_json, baseline_stimulus_id, anchor_set_version, prompt_protocol_version
    from resonance_studies where id=$1`, [run.resonance_study_id]))[0] : null;
  const stimuli = study ? await query(`select id, kind, label, body, position, evidence_response_ids_json, baseline_stamp_json
    from resonance_stimuli where study_id=$1 order by position`, [study.id]) : [];
  const jobs = await query('select state, count(*)::int as n from jobs where run_id=$1 group by state order by state', [id]);
  return { run, metrics, cells, samples, brands, facts, attributes, study, stimuli, jobs };
}

// Committed research artifacts (for example the human-coded description study) are
// evidence too: resolved from the repository file, never from the database.
export function resolveArtifact(source) {
  if (!/^docs\/audits\/[\w./-]+\.json$/.test(source.file) || source.file.includes('..')) throw new Error('Artifact must be a committed docs/audits JSON file');
  const data = JSON.parse(readFileSync(source.file, 'utf8'));
  if (source.select === 'recurrence') return { n: data.rows[0].denominator, reviewMethod: data.codingRun.reviewMethod, counts: data.rows.map(r => ({ name: r.associationLabel, count: r.responsesContainingAssociation })) };
  if (source.select === 'gaps') return data.map(r => ({ id: r.associationId, kind: r.kind }));
  throw new Error('Unsupported artifact selection');
}

export function resolveEvidence(source, bundle) {
  if (source.kind === 'artifact') return resolveArtifact(source);
  const path = (value, key) => key.split('.').reduce((v, k) => v?.[k], value);
  const { kind } = source;
  if (kind === 'run') return path(bundle.run, source.field);
  if (kind === 'study') return path(bundle.study, source.field);
  if (kind === 'factCount') return bundle.facts.length;
  if (kind === 'sampleSummary') return {
    models: [...new Set(bundle.samples.map(s => `${s.provider_id}/${s.model_version}/${s.generation_mode}`))].sort(),
    valid: bundle.samples.filter(s => ['valid','qa_reviewed'].includes(s.extraction_state)).length,
    excluded: bundle.samples.filter(s => !['valid','qa_reviewed'].includes(s.extraction_state)).length,
    refusals: bundle.samples.filter(s => s.extracted_json?.refusal).length,
  };
  if (kind === 'metric') return bundle.metrics.find(m => m.scope_type === source.scopeType && m.scope_key === source.scopeKey && m.metric_key === source.metricKey);
  if (kind === 'stimulus') return path(bundle.stimuli.find(s => s.id === source.id), source.field);
  if (kind === 'cell') return path(bundle.cells.find(s => s.id === source.id), source.field);
  if (kind === 'sample') {
    const value = path(bundle.samples.find(s => s.id === source.id), source.field);
    if (source.excerpt !== undefined) {
      if (typeof value !== 'string' || !value.includes(source.excerpt)) throw new Error('Quote is not verbatim');
      return source.excerpt;
    }
    return value;
  }
  if (kind === 'sampleCount') return bundle.samples.filter(s => !source.intent || bundle.cells.find(c=>c.id===s.cell_id)?.intent===source.intent).length;
  if (kind === 'scenario') {
    const cells = bundle.cells.filter(c=>c.panel_persona_key===source.key && c.stimulus_id===source.stimulus).map(c=>c.id);
    const samples = bundle.samples.filter(s=>cells.includes(s.cell_id) && ['valid','qa_reviewed'].includes(s.extraction_state) && s.extracted_json?.kind==='recommendation');
    return { n: samples.length, included: samples.filter(s=>s.extracted_json.targetIncluded).length, topChoice: samples.filter(s=>s.extracted_json.targetTopPick).length };
  }
  if (kind === 'organicAttributes') {
    const cells = bundle.cells.filter(c=>['discovery','consideration'].includes(c.intent)).map(c=>c.id);
    const mentions = bundle.samples.filter(s=>cells.includes(s.cell_id) && ['valid','qa_reviewed'].includes(s.extraction_state) && !s.extracted_json?.refusal)
      .map(s=>s.extracted_json?.brands?.find(b=>b.canonical_brand_id===source.brand && b.mentioned)).filter(Boolean);
    return { n: mentions.length, counts: bundle.attributes.map(a=>({ name:a.name, count:mentions.filter(m=>m.attributes.includes(a.name)).length })) };
  }
  if (kind === 'rankOneCounts') {
    // First-place picks across the named scenario keys, both messages pooled: the
    // shortlist's own rank 1, with spelling variants folded by the declared aliases.
    const cells = bundle.cells.filter(c=>source.keys.includes(c.panel_persona_key)).map(c=>c.id);
    const samples = bundle.samples.filter(s=>cells.includes(s.cell_id) && ['valid','qa_reviewed'].includes(s.extraction_state) && s.extracted_json?.kind==='recommendation');
    const tally = new Map();
    for (const s of samples) {
      const first = s.extracted_json.recommendations.find(r=>r.rank===1)?.brand?.trim();
      if (!first) continue;
      const name = source.aliases?.[first] ?? first;
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    return { n: samples.length, counts: [...tally].map(([brand,count])=>({brand,count})).sort((a,b)=>b.count-a.count||a.brand.localeCompare(b.brand)) };
  }
  throw new Error(`Unsupported evidence source: ${kind}`);
}
