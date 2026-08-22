import { aggregateHousing, aggregateRecordedVotes } from "./aggregates";
import type { VotePosition } from "./item-types";

export async function handleAggregate(request: Request, housing: boolean) {
  const url = new URL(request.url);
  const voter = (url.searchParams.get("voter") ?? "").trim();
  if (voter.length < 2 || voter.length > 100) return error("voter is required and must be 2 to 100 characters");
  const positionValue = url.searchParams.get("position");
  const position = positionValue && ["aye", "no", "absent", "excused"].includes(positionValue)
    ? positionValue as VotePosition : null;
  if (positionValue && !position) return error("position must be aye, no, absent, or excused");
  const fromYear = parseYear(url.searchParams.get("from"), 2012);
  const toYear = parseYear(url.searchParams.get("to"), new Date().getUTCFullYear());
  if (!fromYear || !toYear || fromYear > toYear) return error("from and to must be valid years from 2012 onward");
  const limit = Number(url.searchParams.get("limit") ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return error("limit must be 1 through 1000");
  const finalOnly = ["1", "true"].includes(url.searchParams.get("final") ?? "");
  const groupValue = url.searchParams.get("groupBy") ?? "file";
  if (!housing && !["file", "roll-call"].includes(groupValue)) return error("groupBy must be file or roll-call");
  const options = {
    voter,
    position,
    fromYear,
    toYear,
    finalOnly,
    groupBy: (housing ? "file" : groupValue) as "file" | "roll-call",
    limit,
  };
  const response = housing ? await aggregateHousing(options) : await aggregateRecordedVotes(options);
  return Response.json(response, { headers: publicHeaders() });
}

function parseYear(value: string | null, fallback: number) {
  if (!value) return fallback;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2012 && year <= 2100 ? year : null;
}

function error(message: string) {
  return Response.json({ error: message }, { status: 400, headers: publicHeaders() });
}

export function publicHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    "X-Robots-Tag": "noindex, follow",
  };
}
