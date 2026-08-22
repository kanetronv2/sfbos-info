import { getSnapshot, snapshotEntities, type SnapshotEntity } from "@/lib/snapshots";
import { publicHeaders } from "@/lib/api-aggregates";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const entity = (await params).entity;
  if (!snapshotEntities.includes(entity as SnapshotEntity)) {
    return Response.json({ error: `entity must be one of ${snapshotEntities.join(", ")}` }, { status: 404, headers: publicHeaders() });
  }
  const url = new URL(request.url);
  const cursor = Number(url.searchParams.get("cursor") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return Response.json({ error: "cursor must be non-negative and limit must be 1 through 1000" }, { status: 400, headers: publicHeaders() });
  }
  const snapshot = await getSnapshot(entity as SnapshotEntity, cursor, limit);
  const format = url.searchParams.get("format") ?? "json";
  if (format === "ndjson") {
    const lines = snapshot.records.map((record) => JSON.stringify(record));
    if (snapshot.nextCursor !== null) lines.push(JSON.stringify({ _meta: { nextCursor: snapshot.nextCursor, schemaVersion: "1.0.0" } }));
    return new Response(`${lines.join("\n")}\n`, { headers: { ...publicHeaders(), "Content-Type": "application/x-ndjson; charset=utf-8" } });
  }
  if (format !== "json") return Response.json({ error: "format must be json or ndjson" }, { status: 400, headers: publicHeaders() });
  return Response.json({ entity, schemaVersion: "1.0.0", cursor, nextCursor: snapshot.nextCursor, count: snapshot.records.length, records: snapshot.records }, { headers: publicHeaders() });
}
