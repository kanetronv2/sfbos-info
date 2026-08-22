import { neon } from "@neondatabase/serverless";
import { publicHeaders } from "@/lib/api-aggregates";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503, headers: publicHeaders() });
  const url = new URL(request.url);
  const cursor = Number(url.searchParams.get("cursor") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 250);
  const sinceValue = url.searchParams.get("since");
  const since = sinceValue ? new Date(sinceValue) : null;
  if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000 || (since && Number.isNaN(since.valueOf()))) {
    return Response.json({ error: "Invalid cursor, limit, or since timestamp" }, { status: 400, headers: publicHeaders() });
  }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(
    `SELECT id::text AS cursor, entity_type AS "entityType", entity_key AS "entityKey",
       change_type AS "changeType", changed_at::text AS "changedAt", version, payload
     FROM change_log
     WHERE id > $1 AND ($2::timestamptz IS NULL OR changed_at >= $2::timestamptz)
     ORDER BY id LIMIT $3`,
    [cursor, since?.toISOString() ?? null, limit],
  );
  return Response.json({
    schemaVersion: "1.0.0",
    cursor,
    nextCursor: rows.length === limit ? Number(rows.at(-1)?.cursor) : null,
    count: rows.length,
    changes: rows,
  }, { headers: { ...publicHeaders(), "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
