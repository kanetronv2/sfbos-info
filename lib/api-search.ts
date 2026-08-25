import { searchAllRecords } from "./unified-search";
import type { VotePosition } from "./item-types";
import type { DocumentKind, SearchResponse, SearchResultType } from "./types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 300;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function handleSearch(request: Request, forceMarkdown = false) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const rawYear = url.searchParams.get("year");
  const rawKind = url.searchParams.get("kind");
  const rawLimit = url.searchParams.get("limit");
  const rawMode = url.searchParams.get("mode") ?? "hybrid";
  const rawType = url.searchParams.get("type") ?? "all";
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  const supervisor = (url.searchParams.get("supervisor") ?? url.searchParams.get("voter") ?? "").trim() || null;
  const rawPosition = url.searchParams.get("position");
  const final = parseBoolean(url.searchParams.get("final"));
  const markdown =
    forceMarkdown ||
    ["md", "markdown"].includes((url.searchParams.get("format") ?? "").toLowerCase()) ||
    Boolean(request.headers.get("accept")?.includes("text/markdown"));

  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return errorResponse(
      `q must contain between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters`,
      markdown,
    );
  }

  const year = parseYear(rawYear);
  if (rawYear && year === null) return errorResponse("year must be an integer from 2012 through 2026", markdown);

  const kind = parseKind(rawKind);
  if (rawKind && kind === null) return errorResponse("kind must be agenda or minutes", markdown);

  const limit = parseLimit(rawLimit);
  if (limit === null) return errorResponse(`limit must be an integer from 1 through ${MAX_LIMIT}`, markdown);

  if (rawMode !== "lexical" && rawMode !== "hybrid") return errorResponse("mode must be lexical or hybrid", markdown);
  const type = parseType(rawType);
  if (!type) return errorResponse("type must be all, legislation, votes, comments, or pages", markdown);
  const fromYear = parseYear(rawFrom);
  const toYear = parseYear(rawTo);
  if ((rawFrom && parseYear(rawFrom) === null) || (rawTo && parseYear(rawTo) === null)) {
    return errorResponse("from and to must be years from 2012 through 2026", markdown);
  }
  if (fromYear !== null && toYear !== null && fromYear > toYear) return errorResponse("from must be less than or equal to to", markdown);
  const position = parsePosition(rawPosition);
  if (rawPosition && !position) return errorResponse("position must be aye, no, absent, or excused", markdown);
  if (final === null) return errorResponse("final must be true or false", markdown);
  const response = await searchAllRecords({
    query, year, kind, type, fromYear, toYear, supervisor, position, final, limit, mode: rawMode,
  });
  if (markdown) {
    return new Response(toMarkdown(response), { headers: markdownHeaders() });
  }

  return Response.json(response, { headers: publicHeaders() });
}

function parseYear(value: string | null) {
  if (!value) return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2012 && year <= 2026 ? year : null;
}

function parseKind(value: string | null): DocumentKind | null {
  return value === "agenda" || value === "minutes" ? value : null;
}

function parseType(value: string): SearchResultType | null {
  return ["all", "legislation", "votes", "comments", "pages"].includes(value)
    ? value as SearchResultType
    : null;
}

function parsePosition(value: string | null): VotePosition | null {
  return value && ["aye", "no", "absent", "excused"].includes(value)
    ? value as VotePosition
    : null;
}

function parseBoolean(value: string | null) {
  if (!value) return false;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function parseLimit(value: string | null) {
  if (!value) return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return null;
  return limit;
}

function errorResponse(message: string, markdown: boolean) {
  if (markdown) {
    return new Response(`# Search error\n\n${message}.\n`, {
      status: 400,
      headers: markdownHeaders(),
    });
  }
  return Response.json({ error: message }, { status: 400, headers: publicHeaders() });
}

function publicHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    "X-Robots-Tag": "noindex, follow",
  };
}

function markdownHeaders() {
  return {
    ...publicHeaders(),
    "Content-Type": "text/markdown; charset=utf-8",
  };
}

function toMarkdown(response: SearchResponse) {
  const filterDescription = [
    response.filters.year ? `year ${response.filters.year}` : null,
    response.filters.kind ? response.filters.kind : null,
    response.filters.type && response.filters.type !== "all" ? response.filters.type : null,
    response.filters.fromYear && response.filters.toYear ? `${response.filters.fromYear}-${response.filters.toYear}` : null,
    response.filters.supervisor ? `supervisor ${response.filters.supervisor}` : null,
    response.filters.position ? `position ${response.filters.position}` : null,
    response.filters.final ? "final actions only" : null,
  ].filter(Boolean).join(", ");

  const lines = [
    "# San Francisco Board of Supervisors search",
    "",
    `- Query: \`${escapeInline(response.query)}\``,
    response.interpretedQueries.length
      ? `- Also interpreted as: ${response.interpretedQueries.map((query) => `\`${escapeInline(query)}\``).join(", ")}`
      : null,
    `- Filters: ${filterDescription || "none"}`,
    `- Matching records: ${response.total}`,
    `- Results returned: ${response.returned}`,
    `- Index: ${response.source === "postgres" ? "complete corpus" : "preview only"}`,
    `- Retrieval: ${response.retrieval.used}${response.retrieval.fallbackReason ? ` (fallback: ${response.retrieval.fallbackReason})` : ""}`,
    "",
  ].filter((line): line is string => line !== null);

  if (!response.results.length) {
    lines.push("No matching pages were found.", "");
  }

  response.results.forEach((result, index) => {
    lines.push(...[
      `## ${index + 1}. [${result.title}](${result.transcriptUrl})`,
      "",
      `- Meeting date: ${result.meetingDate}`,
      `- Document: ${result.kind}`,
      `- Result type: ${result.resultType ?? "page"}`,
      `- PDF page: ${result.page}`,
      result.fileNumber ? `- Structured legislative record: File ${result.fileNumber}` : null,
      result.recordedPosition ? `- Recorded position: ${result.recordedPosition}` : null,
      result.action ? `- Action: ${result.action.replace(/\s+/g, " ").trim()}` : null,
      result.extracted?.housingUnits.length ? `- Housing-unit counts: ${result.extracted.housingUnits.join(", ")}` : null,
      result.extracted?.addresses.length ? `- Addresses: ${result.extracted.addresses.join("; ")}` : null,
      `- [Focused Markdown excerpt](${result.markdownUrl})`,
      `- [Official source PDF](${result.officialUrl})`,
      "",
      `> ${result.snippet.replace(/\n/g, " ")}`,
      "",
    ].filter((line): line is string => line !== null));
  });

  lines.push(
    "---",
    "Results are extracted-text matches, not an answer by themselves. Verify conclusions, votes, and names against the linked official PDF.",
    "",
  );
  return lines.join("\n");
}

function escapeInline(value: string) {
  return value.replace(/`/g, "\\`");
}
