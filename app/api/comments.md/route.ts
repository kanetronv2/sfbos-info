import { handleCommentSearch } from "@/lib/api-comments";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCommentSearch(request, true);
}
