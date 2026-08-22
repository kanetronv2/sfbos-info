import { getQualityReport } from "@/lib/quality";
import { publicHeaders } from "@/lib/api-aggregates";
export const runtime = "nodejs";
export async function GET() {
  const report = await getQualityReport();
  return Response.json(report ?? { error: "Database unavailable" }, { status: report ? 200 : 503, headers: publicHeaders() });
}
