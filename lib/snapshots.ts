import { neon } from "@neondatabase/serverless";

export const snapshotEntities = ["documents", "supervisors", "recorded-positions", "legislative-files"] as const;
export type SnapshotEntity = typeof snapshotEntities[number];

export async function getSnapshot(entity: SnapshotEntity, cursor: number, limit: number) {
  if (!process.env.DATABASE_URL) return { records: [], nextCursor: null };
  const sql = neon(process.env.DATABASE_URL);
  const queries: Record<SnapshotEntity, string> = {
    documents: `SELECT d.id::text AS id, d.meeting_date::text AS "meetingDate", d.kind,
      d.title, d.official_url AS "officialUrl", d.page_count AS "pageCount",
      d.event_id::text AS "legistarEventId", d.event_guid::text AS "legistarEventGuid",
      dv.version_number AS "latestVersion", dv.content_sha256 AS "contentSha256"
      FROM documents d LEFT JOIN LATERAL (
        SELECT version_number, content_sha256 FROM document_versions
        WHERE document_id = d.id ORDER BY version_number DESC LIMIT 1
      ) dv ON true WHERE d.id > $1 ORDER BY d.id LIMIT $2`,
    supervisors: `SELECT s.id::text AS id, s.slug, s.display_name AS "displayName",
      s.family_name AS "familyName", s.district, s.term_start::text AS "termStart",
      s.term_end::text AS "termEnd", s.legistar_person_id::text AS "legistarPersonId",
      s.active, coalesce(json_agg(json_build_object('alias', a.alias, 'confidence', a.confidence))
        FILTER (WHERE a.id IS NOT NULL), '[]'::json) AS aliases
      FROM supervisors s LEFT JOIN supervisor_aliases a ON a.supervisor_id = s.id
      WHERE s.id > $1 GROUP BY s.id ORDER BY s.id LIMIT $2`,
    "recorded-positions": `SELECT rcp.id::text AS id, s.slug AS "supervisorSlug",
      rcp.recorded_name AS "recordedName", rcp.position, rcp.confidence::float,
      rc.action, rc.action_type AS "actionType", rc.is_final AS "isFinal",
      i.file_number AS "fileNumber", d.meeting_date::text AS "meetingDate",
      d.id::text AS "documentId", i.start_page AS "page"
      FROM roll_call_positions rcp
      LEFT JOIN supervisors s ON s.id = rcp.supervisor_id
      JOIN roll_calls rc ON rc.id = rcp.roll_call_id
      JOIN legislative_items i ON i.id = rc.item_id
      JOIN documents d ON d.id = i.document_id
      WHERE rcp.id > $1 ORDER BY rcp.id LIMIT $2`,
    "legislative-files": `SELECT f.id::text AS id, f.file_number AS "fileNumber",
      f.legistar_matter_id::text AS "legistarMatterId", f.canonical_title AS title,
      f.first_seen_date::text AS "firstSeenDate", f.last_seen_date::text AS "lastSeenDate",
      f.metadata FROM legislative_files f WHERE f.id > $1 ORDER BY f.id LIMIT $2`,
  };
  const records = await sql.query(queries[entity], [cursor, limit]);
  return {
    records,
    nextCursor: records.length === limit ? Number(records.at(-1)?.id) : null,
  };
}
