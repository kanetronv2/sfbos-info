import { handleEvidenceQuery } from "@/lib/api-query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleEvidenceQuery(request, true);
}
