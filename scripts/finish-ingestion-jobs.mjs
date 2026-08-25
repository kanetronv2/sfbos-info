import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const status = process.argv.includes("--failed") ? "failed" : "complete";

if (status === "failed") {
  const result = await sql.query(
    `UPDATE ingestion_jobs SET status = 'failed', finished_at = now(), updated_at = now(),
       error = coalesce(error, 'The ingestion workflow did not complete')
     WHERE status = 'running' RETURNING id`,
  );
  console.log(`Marked ${result.length} running ingestion jobs failed.`);
} else {
  const result = await sql.query(
    `WITH matches AS (
       SELECT j.id AS job_id, (
         SELECT d.id FROM documents d
         WHERE d.page_count > 0 AND (
           d.official_url = j.official_url
           OR (j.event_id IS NOT NULL AND d.event_id = j.event_id AND d.kind = j.kind)
           OR (j.event_id IS NULL AND d.meeting_date = j.meeting_date AND d.kind = j.kind)
         )
         ORDER BY (d.official_url = j.official_url) DESC, d.indexed_at DESC
         LIMIT 1
       ) AS document_id
       FROM ingestion_jobs j
       WHERE j.status = 'running'
     )
     UPDATE ingestion_jobs j SET
       status = 'complete', document_id = d.id, finished_at = now(), updated_at = now(), error = NULL
     FROM documents d, matches m
     WHERE j.id = m.job_id AND d.id = m.document_id
     RETURNING j.id`,
  );
  console.log(`Completed ${result.length} ingestion jobs.`);
  const remaining = await sql.query("SELECT id::text, source_key FROM ingestion_jobs WHERE status = 'running'");
  if (remaining.length) throw new Error(`${remaining.length} jobs were downloaded but did not produce indexed documents`);
}
