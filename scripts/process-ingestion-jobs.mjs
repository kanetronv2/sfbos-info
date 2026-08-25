import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requestedIds = (process.env.INGESTION_JOB_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const filter = requestedIds.length ? "AND id = ANY($1::bigint[])" : "";
const jobs = await sql.query(
  `SELECT id::text, source_key, source, meeting_date::text, kind, official_url,
     event_id::text, event_guid::text, source_content_length::text
   FROM ingestion_jobs
   WHERE status IN ('pending', 'dispatched') ${filter}
   ORDER BY meeting_date, kind`,
  requestedIds.length ? [requestedIds] : [],
);

console.log(`Processing ${jobs.length} queued official document${jobs.length === 1 ? "" : "s"}.`);
const failures = [];
for (const job of jobs) {
  try {
    await sql.query(
      `UPDATE ingestion_jobs SET status = 'running', started_at = now(), updated_at = now(),
       attempts = attempts + 1, error = NULL WHERE id = $1`,
      [job.id],
    );
    const response = await fetch(job.official_url, {
      headers: { "User-Agent": "sfbos.info ingestion worker/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Download returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") throw new Error("Download is not a PDF");
    const outputPath = localPath(job);
    await mkdir(dirname(outputPath), { recursive: true });
    let unchanged = false;
    try {
      const existing = await readFile(outputPath);
      unchanged = sha256(existing) === sha256(bytes);
    } catch {}
    if (!unchanged) await writeFile(outputPath, bytes);
    console.log(`${unchanged ? "Verified" : "Downloaded"} ${job.meeting_date} ${job.kind}: ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${job.source_key}: ${message}`);
    await sql.query(
      `UPDATE ingestion_jobs SET status = 'failed', finished_at = now(), updated_at = now(), error = $2 WHERE id = $1`,
      [job.id, message.slice(0, 10_000)],
    );
  }
}
if (failures.length) throw new Error(failures.join("\n"));

function localPath(job) {
  const year = job.meeting_date.slice(0, 4);
  const directory = join(projectRoot, "data", "full-board-meetings", job.kind === "agenda" ? "agendas" : "minutes", year);
  if (job.event_id && job.event_guid) {
    return join(directory, `${job.meeting_date}_${job.event_id}_${job.event_guid.toUpperCase()}_${job.kind}.pdf`);
  }
  const archiveFilename = basename(new URL(job.official_url).pathname);
  if (/^bag\d{6}_(agenda|minutes)\.pdf$/i.test(archiveFilename)) return join(directory, archiveFilename);
  return join(directory, `${job.meeting_date}_${sha256(job.source_key).slice(0, 12)}_${job.kind}.pdf`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
