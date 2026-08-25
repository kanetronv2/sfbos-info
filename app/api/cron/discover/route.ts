import { neon } from "@neondatabase/serverless";
import { discoverOfficialDocuments } from "@/lib/ingestion-discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const startedAt = Date.now();
  const candidates = await discoverOfficialDocuments();
  const sql = neon(process.env.DATABASE_URL);
  const jobs = await sql.query(
    `WITH candidates AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         source_key text, source text, meeting_date date, kind text,
         official_url text, event_id bigint, event_guid uuid,
         source_content_length bigint, source_etag text, source_last_modified timestamptz
       )
     ), prepared AS (
       SELECT c.*,
         EXISTS (
           SELECT 1 FROM documents d
           WHERE d.page_count > 0 AND (
             d.official_url = c.official_url
             OR (c.event_id IS NOT NULL AND d.event_id = c.event_id AND d.kind = c.kind)
             OR (c.event_id IS NULL AND d.meeting_date = c.meeting_date AND d.kind = c.kind)
           )
         ) AS indexed
       FROM candidates c
     )
     INSERT INTO ingestion_jobs (
       source_key, source, meeting_date, kind, official_url, event_id, event_guid,
       source_content_length, source_etag, source_last_modified, status, finished_at
     )
     SELECT source_key, source, meeting_date, kind, official_url, event_id, event_guid,
       source_content_length, source_etag, source_last_modified,
       CASE WHEN indexed THEN 'complete' ELSE 'pending' END,
       CASE WHEN indexed THEN now() ELSE NULL END
     FROM prepared
     ON CONFLICT (source_key) DO UPDATE SET
       official_url = excluded.official_url,
       event_id = coalesce(excluded.event_id, ingestion_jobs.event_id),
       event_guid = coalesce(excluded.event_guid, ingestion_jobs.event_guid),
       source_content_length = coalesce(excluded.source_content_length, ingestion_jobs.source_content_length),
       source_etag = coalesce(excluded.source_etag, ingestion_jobs.source_etag),
       source_last_modified = coalesce(excluded.source_last_modified, ingestion_jobs.source_last_modified),
       status = CASE
         WHEN ingestion_jobs.status = 'failed' THEN 'pending'
         WHEN ingestion_jobs.status = 'complete' AND (
           (excluded.source_content_length IS NOT NULL AND ingestion_jobs.source_content_length IS NOT NULL
             AND excluded.source_content_length <> ingestion_jobs.source_content_length)
           OR (excluded.source_etag IS NOT NULL AND ingestion_jobs.source_etag IS NOT NULL
             AND excluded.source_etag <> ingestion_jobs.source_etag)
           OR (excluded.source_last_modified IS NOT NULL AND ingestion_jobs.source_last_modified IS NOT NULL
             AND excluded.source_last_modified <> ingestion_jobs.source_last_modified)
         ) THEN 'pending'
         ELSE ingestion_jobs.status
       END,
       updated_at = now(),
       error = CASE WHEN ingestion_jobs.status = 'failed' THEN NULL ELSE ingestion_jobs.error END
     RETURNING id::text, source_key, status`,
    [JSON.stringify(candidates.map((candidate) => ({
      source_key: candidate.sourceKey,
      source: candidate.source,
      meeting_date: candidate.meetingDate,
      kind: candidate.kind,
      official_url: candidate.officialUrl,
      event_id: candidate.eventId,
      event_guid: candidate.eventGuid,
      source_content_length: candidate.contentLength,
      source_etag: candidate.etag,
      source_last_modified: candidate.lastModified,
    })))],
  );

  const pendingIds = jobs.filter((job) => job.status === "pending").map((job) => String(job.id));
  let dispatched = false;
  let dispatchError: string | null = null;
  if (pendingIds.length) {
    try {
      await dispatchIngestion(pendingIds);
      await sql.query(
        `UPDATE ingestion_jobs SET status = 'dispatched', dispatched_at = now(), updated_at = now()
         WHERE id = ANY($1::bigint[]) AND status = 'pending'`,
        [pendingIds],
      );
      dispatched = true;
    } catch (error) {
      dispatchError = error instanceof Error ? error.message : String(error);
    }
  }

  return Response.json({
    ok: true,
    discovered: candidates.length,
    pending: pendingIds.length,
    dispatched,
    dispatchError,
    durationMs: Date.now() - startedAt,
  });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function dispatchIngestion(jobIds: string[]) {
  const token = process.env.GITHUB_INGEST_TOKEN;
  if (!token) throw new Error("GITHUB_INGEST_TOKEN is not configured");
  const repository = process.env.GITHUB_INGEST_REPOSITORY ?? "kanetronv2/sfbos-info";
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/ingest.yml/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "sfbos.info ingestion dispatcher/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs: { job_ids: jobIds.join(",") } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub workflow dispatch returned ${response.status}`);
}
