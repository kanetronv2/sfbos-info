import { handleItemSearch } from "@/lib/api-items";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleItemSearch(request, true);
}
