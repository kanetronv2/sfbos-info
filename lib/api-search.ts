import { searchDocuments } from "./search";
import type { DocumentKind, SearchResponse } from "./types";

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
  const rawMode = url.searchParams.get("mode") ?? "lexical";
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
  const response = await searchDocuments({ query, year, kind, limit, mode: rawMode });
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
  ].filter(Boolean).join(", ");

  const lines = [
    "# San Francisco Board of Supervisors search",
    "",
    `- Query: \`${escapeInline(response.query)}\``,
    response.interpretedQueries.length
      ? `- Also interpreted as: ${response.interpretedQueries.map((query) => `\`${escapeInline(query)}\``).join(", ")}`
      : null,
    `- Filters: ${filterDescription || "none"}`,
    `- Matching pages: ${response.total}`,
    `- Results returned: ${response.returned}`,
    `- Index: ${response.source === "postgres" ? "complete corpus" : "preview only"}`,
    `- Retrieval: ${response.retrieval.used}${response.retrieval.fallbackReason ? ` (fallback: ${response.retrieval.fallbackReason})` : ""}`,
    "",
  ].filter((line): line is string => line !== null);

  if (!response.results.length) {
    lines.push("No matching pages were found.", "");
  }

  response.results.forEach((result, index) => {
    lines.push(
      `## ${index + 1}. [${result.title}](${result.transcriptUrl})`,
      "",
      `- Meeting date: ${result.meetingDate}`,
      `- Document: ${result.kind}`,
      `- PDF page: ${result.page}`,
      `- [Focused Markdown excerpt](${result.markdownUrl})`,
      `- [Official source PDF](${result.officialUrl})`,
      "",
      `> ${result.snippet.replace(/\n/g, " ")}`,
      "",
    );
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
