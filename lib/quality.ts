import { neon } from "@neondatabase/serverless";

export async function getQualityReport() {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  const [metrics, parsers, runs, unresolved] = await Promise.all([
    sql.query(
      `SELECT
        (SELECT count(*)::int FROM documents) AS documents,
        (SELECT count(*)::int FROM documents WHERE page_count > 0) AS indexed_documents,
        (SELECT count(*)::int FROM documents WHERE page_count = 0) AS catalog_only_documents,
        (SELECT count(*)::int FROM documents d WHERE d.page_count > 0 AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.document_id = d.id)) AS documents_without_pages,
        (SELECT count(*)::int FROM documents d WHERE d.page_count > 0 AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id)) AS documents_without_versions,
        (SELECT count(*)::int FROM legislative_items) AS legislative_items,
        (SELECT count(*)::int FROM legislative_items i WHERE NOT EXISTS (SELECT 1 FROM roll_calls rc WHERE rc.item_id = i.id)) AS items_without_roll_calls,
        (SELECT count(*)::int FROM roll_call_positions) AS recorded_positions,
        (SELECT count(*)::int FROM roll_call_positions WHERE supervisor_id IS NULL) AS unresolved_positions,
        (SELECT count(*)::int FROM evidence_spans) AS evidence_spans,
        (SELECT count(*)::int FROM evidence_spans WHERE confidence < 0.8) AS low_confidence_spans,
        (SELECT count(*)::int FROM legislative_files) AS reconciled_files,
        (SELECT count(*)::int FROM legislative_files WHERE legistar_matter_id IS NOT NULL) AS legistar_matched_files`,
      [],
    ),
    sql.query(
      `SELECT parser_name, parser_version, count(*)::int AS runs, max(finished_at)::text AS last_finished
       FROM parser_runs GROUP BY parser_name, parser_version ORDER BY last_finished DESC NULLS LAST`,
      [],
    ),
    sql.query(
      `SELECT id::text, source, status, parser_version, started_at::text, finished_at::text, statistics, error
       FROM ingestion_runs ORDER BY started_at DESC LIMIT 10`,
      [],
    ),
    sql.query(
      `SELECT recorded_name, count(*)::int AS occurrences
       FROM roll_call_positions WHERE supervisor_id IS NULL
       GROUP BY recorded_name ORDER BY occurrences DESC, recorded_name LIMIT 50`,
      [],
    ),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    metrics: metrics[0],
    parserVersions: parsers,
    recentIngestionRuns: runs,
    unresolvedRecordedNames: unresolved,
    definitions: {
      unresolvedPosition: "A name parsed from a roll call that has not been reconciled to a supervisor identity.",
      lowConfidenceSpan: "An extraction evidence span with confidence below 0.80.",
      legistarMatchedFile: "An internal file identifier reconciled to a Legistar MatterId.",
      catalogOnlyDocument: "An official source record in the historical catalog whose text has not been extracted into the full-text index.",
    },
  };
}
