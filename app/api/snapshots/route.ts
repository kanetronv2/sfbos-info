import { snapshotEntities } from "@/lib/snapshots";
import { getSiteUrl } from "@/lib/site-url";
import { publicHeaders } from "@/lib/api-aggregates";
export const runtime = "nodejs";
export async function GET() {
  const base = getSiteUrl();
  return Response.json({
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    entities: snapshotEntities.map((entity) => ({
      entity,
      json: `${base}/api/snapshots/${entity}?format=json&limit=1000`,
      ndjson: `${base}/api/snapshots/${entity}?format=ndjson&limit=1000`,
      pagination: "Follow nextCursor using the cursor query parameter until it is null.",
    })),
  }, { headers: publicHeaders() });
}
