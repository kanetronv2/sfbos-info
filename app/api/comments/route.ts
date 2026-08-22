import { handleCommentSearch } from "@/lib/api-comments";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCommentSearch(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type",
    },
  });
}
