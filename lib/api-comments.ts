import { searchPublicComments } from "./comment-search";
import type { PublicCommentResponse } from "./comment-types";

const MIN_YEAR = 2012;
const MAX_YEAR = 2026;
const MAX_LIMIT = 50;

export async function handleCommentSearch(request: Request, forceMarkdown = false) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const speaker = (url.searchParams.get("speaker") ?? "").trim() || null;
  const markdown = forceMarkdown || ["md", "markdown"].includes((url.searchParams.get("format") ?? "").toLowerCase()) || Boolean(request.headers.get("accept")?.includes("text/markdown"));

  if (query.length < 2 || query.length > 300) return errorResponse("q must contain between 2 and 300 characters", markdown);
  if (speaker && speaker.length > 80) return errorResponse("speaker must not exceed 80 characters", markdown);
  const fromYear = parseYear(url.searchParams.get("from"), MIN_YEAR);
  const toYear = parseYear(url.searchParams.get("to"), MAX_YEAR);
  if (fromYear === null || toYear === null) return errorResponse(`from and to must be years from ${MIN_YEAR} through ${MAX_YEAR}`, markdown);
  if (fromYear > toYear) return errorResponse("from must not be later than to", markdown);
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) return errorResponse(`limit must be an integer from 1 through ${MAX_LIMIT}`, markdown);

  const response = await searchPublicComments({ query, speaker, fromYear, toYear, limit });
  if (markdown) return new Response(toMarkdown(response), { headers: markdownHeaders() });
  return Response.json(response, { headers: publicHeaders() });
}

function parseYear(value: string | null, fallback: number) {
  if (!value) return fallback;
  const year = Number(value);
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

function parseLimit(value: string | null) {
  if (!value) return 20;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function errorResponse(message: string, markdown: boolean) {
  if (markdown) return new Response(`# Public-comment search error\n\n${message}.\n`, { status: 400, headers: markdownHeaders() });
  return Response.json({ error: message }, { status: 400, headers: publicHeaders() });
}

function publicHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };
}

function markdownHeaders() {
  return { ...publicHeaders(), "Content-Type": "text/markdown; charset=utf-8" };
}

function toMarkdown(response: PublicCommentResponse) {
  const lines = [
    "# San Francisco Board of Supervisors public-comment search",
    "",
    `- Query: \`${response.query.replace(/`/g, "\\`")}\``,
    `- Speaker: ${response.filters.speaker ?? "any"}`,
    `- Years: ${response.filters.fromYear}–${response.filters.toYear}`,
    `- Matching speaker statements: ${response.total}`,
    "",
  ];
  for (const [index, result] of response.results.entries()) {
    lines.push(
      `## ${index + 1}. ${result.speaker}`,
      "",
      `- Meeting: ${result.meetingDate}`,
      `- [Extracted minutes, page ${result.page}](${result.transcriptUrl})`,
      `- [Official source PDF](${result.officialUrl})`,
      "",
      `> ${result.statement}`,
      "",
    );
  }
  if (!response.results.length) lines.push("No matching speaker statements were found.", "");
  lines.push("---", "Statements are clerk-written summaries in official minutes, not verbatim transcripts.", "");
  return lines.join("\n");
}
