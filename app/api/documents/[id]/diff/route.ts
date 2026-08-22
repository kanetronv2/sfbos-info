import { diffDocumentVersions } from "@/lib/versions";
import { publicHeaders } from "@/lib/api-aggregates";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from === to) {
    return Response.json({ error: "from and to must be different positive version numbers" }, { status: 400, headers: publicHeaders() });
  }
  const diff = await diffDocumentVersions((await params).id, from, to);
  if (!diff) return Response.json({ error: "version pair not found" }, { status: 404, headers: publicHeaders() });
  return Response.json(diff, { headers: publicHeaders() });
}
