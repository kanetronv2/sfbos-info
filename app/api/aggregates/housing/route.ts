import { handleAggregate } from "@/lib/api-aggregates";
export const runtime = "nodejs";
export async function GET(request: Request) { return handleAggregate(request, true); }
