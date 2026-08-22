import { handleSearch } from "@/lib/api-search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSearch(request);
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
