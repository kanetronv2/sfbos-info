import { searchLegislativeItems } from "./item-search";
import type { GroupBy, LegislativeItemResponse, RollCall, VotePosition } from "./item-types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 300;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_YEAR = 1996;
const MAX_YEAR = 2026;

export async function handleItemSearch(request: Request, forceMarkdown = false) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const voter = (url.searchParams.get("voter") ?? "").trim() || null;
  const rawPosition = url.searchParams.get("position");
  const rawFinal = url.searchParams.get("final");
  const rawGroupBy = url.searchParams.get("groupBy");
  const rawFromYear = url.searchParams.get("from");
  const rawToYear = url.searchParams.get("to");
  const rawLimit = url.searchParams.get("limit");
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
  if (voter && voter.length > 80) return errorResponse("voter must not exceed 80 characters", markdown);

  const position = parsePosition(rawPosition);
  if (rawPosition && position === null) {
    return errorResponse("position must be aye, no, absent, or excused", markdown);
  }
  if (position && !voter) return errorResponse("position requires a voter", markdown);

  const final = parseBoolean(rawFinal, false);
  if (final === null) return errorResponse("final must be true or false", markdown);
  const groupBy = parseGroupBy(rawGroupBy);
  if (groupBy === null) return errorResponse("groupBy must be none, file, or matter", markdown);

  const fromYear = parseYear(rawFromYear, MIN_YEAR);
  const toYear = parseYear(rawToYear, MAX_YEAR);
  if (fromYear === null || toYear === null) {
    return errorResponse(`from and to must be years from ${MIN_YEAR} through ${MAX_YEAR}`, markdown);
  }
  if (fromYear > toYear) return errorResponse("from must not be later than to", markdown);

  const limit = parseLimit(rawLimit);
  if (limit === null) return errorResponse(`limit must be an integer from 1 through ${MAX_LIMIT}`, markdown);

  const response = await searchLegislativeItems({
    query,
    voter,
    voterKey: voter ? voter.split(/\s+/).at(-1)?.replace(/[^a-z'-]/gi, "") || null : null,
    position,
    final,
    groupBy,
    fromYear,
    toYear,
    limit,
  });

  if (markdown) return new Response(toMarkdown(response), { headers: markdownHeaders() });
  return Response.json(response, { headers: publicHeaders() });
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (!value) return fallback;
  if (["true", "1"].includes(value.toLowerCase())) return true;
  if (["false", "0"].includes(value.toLowerCase())) return false;
  return null;
}

function parseGroupBy(value: string | null): GroupBy | null {
  if (!value) return "none";
  return value === "none" || value === "file" || value === "matter" ? value : null;
}

function parsePosition(value: string | null): VotePosition | null {
  return value === "aye" || value === "no" || value === "absent" || value === "excused"
    ? value
    : null;
}

function parseYear(value: string | null, fallback: number) {
  if (!value) return fallback;
  const year = Number(value);
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

function parseLimit(value: string | null) {
  if (!value) return DEFAULT_LIMIT;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function errorResponse(message: string, markdown: boolean) {
  if (markdown) {
    return new Response(`# Item search error\n\n${message}.\n`, {
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
  return { ...publicHeaders(), "Content-Type": "text/markdown; charset=utf-8" };
}

function toMarkdown(response: LegislativeItemResponse) {
  const lines = [
    "# San Francisco Board of Supervisors legislative-item search",
    "",
    `- Query: \`${escapeInline(response.query)}\``,
    `- Voter: ${response.filters.voter ? `\`${escapeInline(response.filters.voter)}\`` : "any"}`,
    `- Position: ${response.filters.position ?? "any"}`,
    `- Final actions only: ${response.filters.final ? "yes" : "no"}`,
    `- Grouped by: ${response.filters.groupBy}`,
    `- Years: ${response.filters.fromYear}–${response.filters.toYear}`,
    response.interpretedQueries.length
      ? `- Also interpreted as: ${response.interpretedQueries.map((query) => `\`${escapeInline(query)}\``).join(", ")}`
      : null,
    `- Matching items: ${response.total}`,
    `- Results returned: ${response.returned}`,
    "",
  ].filter((line): line is string => line !== null);

  for (const [index, result] of response.results.entries()) {
    lines.push(
      `## ${index + 1}. File ${result.fileNumber}: [${result.title}](${result.transcriptUrl})`,
      "",
      `- Meeting date: ${result.meetingDate}`,
      `- Official PDF pages: ${pageRange(result.startPage, result.endPage)}`,
      `- [Focused Markdown excerpt](${result.markdownUrl})`,
      `- [Official source PDF](${result.officialUrl})`,
      result.groupCount > 1 ? `- Grouped matching records: ${result.groupCount}` : "",
      "",
      `> ${result.snippet}`,
      "",
    );
    if (result.extracted.amounts.length || result.extracted.housingUnits.length || result.extracted.addresses.length || result.extracted.parties.length) {
      lines.push("### Extracted facts", "");
      if (result.extracted.parties.length) lines.push(`- Parties: ${result.extracted.parties.join("; ")}`);
      if (result.extracted.amounts.length) {
        lines.push(`- Amounts: ${result.extracted.amounts.map((amount) => `${amount.raw} (${amount.qualifier})`).join("; ")}`);
      }
      if (result.extracted.housingUnits.length) lines.push(`- Housing-unit counts: ${result.extracted.housingUnits.join(", ")}`);
      if (result.extracted.addresses.length) lines.push(`- Addresses: ${result.extracted.addresses.join("; ")}`);
      lines.push("");
    }
    if (result.rollCalls.length) {
      lines.push("### Recorded roll calls", "");
      for (const rollCall of result.rollCalls) lines.push(...rollCallMarkdown(rollCall));
    }
  }

  if (!response.results.length) lines.push("No matching legislative items were found.", "");
  lines.push(
    "---",
    "Aye and No are positions on the action quoted above, not automatic measures of support or opposition to the underlying project. Verify conclusions against the linked official minutes.",
    "",
  );
  return lines.join("\n");
}

function rollCallMarkdown(rollCall: RollCall) {
  const finalLabel = rollCall.isFinal ? ", final" : "";
  const lines = [
    `**Vote ${rollCall.sequence} · ${rollCall.actionType}${finalLabel}.** ${rollCall.action || "Action text unavailable."}`,
    "",
  ];
  for (const [label, names] of [
    ["Ayes", rollCall.ayes],
    ["Noes", rollCall.noes],
    ["Absent", rollCall.absent],
    ["Excused", rollCall.excused],
  ] as const) {
    if (names.length) lines.push(`- ${label}: ${names.join(", ")}`);
  }
  lines.push("");
  return lines;
}

function pageRange(start: number, end: number) {
  return start === end ? String(start) : `${start}–${end}`;
}

function escapeInline(value: string) {
  return value.replace(/`/g, "\\`");
}
