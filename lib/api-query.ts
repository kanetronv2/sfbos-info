import { searchPublicComments } from "./comment-search";
import { searchLegislativeItems } from "./item-search";
import { searchDocuments } from "./search";
import { aggregateHousing } from "./aggregates";
import { interpretSearchQuestion } from "./search-intent";
import type { LegislativeItemResult, RollCall, VotePosition } from "./item-types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 500;

export async function handleEvidenceQuery(request: Request, forceMarkdown = false) {
  const url = new URL(request.url);
  const question = (url.searchParams.get("q") ?? "").trim();
  const markdown =
    forceMarkdown ||
    ["md", "markdown"].includes((url.searchParams.get("format") ?? "").toLowerCase()) ||
    Boolean(request.headers.get("accept")?.includes("text/markdown"));

  if (question.length < MIN_QUERY_LENGTH || question.length > MAX_QUERY_LENGTH) {
    return errorResponse(
      `q must contain between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters`,
      markdown,
    );
  }

  const interpretation = interpretSearchQuestion(question);
  const [items, pages, comments, deterministicAggregate] = await Promise.all([
    searchLegislativeItems({
      query: interpretation.searchQuery,
      voter: interpretation.voter,
      voterKey: interpretation.voter?.toLowerCase() ?? null,
      position: interpretation.recordedPosition,
      final: interpretation.finalOnly,
      groupBy: "matter",
      fromYear: interpretation.fromYear,
      toYear: interpretation.toYear,
      limit: 12,
    }),
    searchDocuments({
      query: interpretation.searchQuery,
      year: interpretation.fromYear === interpretation.toYear ? interpretation.fromYear : null,
      kind: interpretation.voteIntent ? "minutes" : null,
      limit: 8,
    }),
    interpretation.commentIntent
      ? searchPublicComments({
          query: interpretation.searchQuery,
          speaker: null,
          fromYear: interpretation.fromYear,
          toYear: interpretation.toYear,
          limit: 8,
        })
      : null,
    interpretation.housingIntent && interpretation.voter
      ? aggregateHousing({
          voter: interpretation.voter,
          position: interpretation.recordedPosition,
          fromYear: interpretation.fromYear,
          toYear: interpretation.toYear,
          finalOnly: interpretation.finalOnly,
          groupBy: "file",
          limit: 1000,
        })
      : null,
  ]);

  const response = {
    question,
    interpretation,
    guidance: [
      interpretation.recordedPosition
        ? `Results are filtered to recorded ${interpretation.recordedPosition.toUpperCase()} positions as a retrieval aid; this does not by itself establish the voter's stance on the underlying matter.`
        : null,
      "Treat each Aye or No as a position on its attached action, not automatically as support or opposition to the underlying project.",
      "Use transcriptUrl for page-addressable evidence and officialUrl for the authoritative City PDF.",
      "This endpoint returns evidence, not a synthesized conclusion.",
    ].filter((value): value is string => Boolean(value)),
    legislativeItems: items,
    pageMatches: pages,
    publicComments: comments,
    deterministicAggregate,
  };

  if (markdown) return new Response(toMarkdown(response), { headers: markdownHeaders() });
  return Response.json(response, { headers: publicHeaders() });
}

type EvidenceResponse = {
  question: string;
  interpretation: ReturnType<typeof interpretSearchQuestion>;
  legislativeItems: Awaited<ReturnType<typeof searchLegislativeItems>>;
  pageMatches: Awaited<ReturnType<typeof searchDocuments>>;
  publicComments: Awaited<ReturnType<typeof searchPublicComments>> | null;
  deterministicAggregate: Awaited<ReturnType<typeof aggregateHousing>> | null;
};

function toMarkdown(response: EvidenceResponse) {
  const { interpretation } = response;
  const lines = [
    "# San Francisco Board of Supervisors evidence bundle",
    "",
    `- Question: ${response.question}`,
    `- Search terms: \`${interpretation.searchQuery.replace(/`/g, "\\`")}\``,
    `- Recorded voter: ${interpretation.voter ?? "not inferred"}`,
    `- Recorded position filter: ${interpretation.recordedPosition ?? "none"}`,
    `- Years: ${interpretation.fromYear}-${interpretation.toYear}`,
    `- Intent: ${[
      interpretation.voteIntent ? "votes" : null,
      interpretation.housingIntent ? "housing" : null,
      interpretation.commentIntent ? "public comment" : null,
      interpretation.finalOnly ? "final actions" : null,
    ].filter(Boolean).join(", ") || "general records"}`,
    "",
    "> This is an evidence bundle, not a synthesized answer. Interpret every recorded vote in the context of its attached action.",
    "",
    "## Legislative files and votes",
    "",
  ];

  if (response.deterministicAggregate) {
    const aggregate = response.deterministicAggregate;
    lines.push(
      "## Deterministic housing-unit aggregation",
      "",
      `- Selected unit-count total: ${aggregate.aggregation.selectedUnitCountTotal}`,
      `- Files with a known count: ${aggregate.aggregation.filesWithKnownUnitCount}`,
      `- Files without a known count: ${aggregate.aggregation.filesWithoutKnownUnitCount}`,
      `- Addresses: ${aggregate.aggregation.addresses.join("; ") || "none extracted"}`,
      `- Rule: ${aggregate.aggregation.rule}`,
      `- Caution: ${aggregate.aggregation.caution}`,
      "",
    );
  }

  for (const [index, item] of response.legislativeItems.results.entries()) {
    lines.push(
      `### ${index + 1}. File ${item.fileNumber}: [${item.title}](${item.transcriptUrl})`,
      "",
      `- Meeting: ${item.meetingDate}`,
      `- [Focused Markdown excerpt](${item.markdownUrl})`,
      `- [Official City PDF](${item.officialUrl})`,
    );
    if (item.extracted.housingUnits.length) lines.push(`- Housing-unit counts: ${item.extracted.housingUnits.join(", ")}`);
    if (item.extracted.addresses.length) lines.push(`- Addresses: ${item.extracted.addresses.join("; ")}`);
    if (item.extracted.amounts.length) lines.push(`- Amounts: ${item.extracted.amounts.map((amount) => amount.raw).join("; ")}`);
    if (item.extracted.parties.length) lines.push(`- Parties: ${item.extracted.parties.join("; ")}`);
    lines.push("", `> ${item.snippet}`, "");

    for (const rollCall of relevantRollCalls(item, interpretation.voter, interpretation.recordedPosition)) {
      lines.push(...rollCallMarkdown(rollCall, interpretation.voter));
    }
  }
  if (!response.legislativeItems.results.length) lines.push("No matching legislative files were found.", "");

  lines.push("## Page-level evidence", "");
  for (const [index, page] of response.pageMatches.results.entries()) {
    lines.push(
      `### ${index + 1}. [${page.title}, page ${page.page}](${page.transcriptUrl})`,
      "",
      `- Meeting: ${page.meetingDate}`,
      `- [Focused Markdown excerpt](${page.markdownUrl})`,
      `- [Official City PDF](${page.officialUrl})`,
      "",
      `> ${page.snippet}`,
      "",
    );
  }
  if (!response.pageMatches.results.length) lines.push("No additional page matches were found.", "");

  if (response.publicComments) {
    lines.push("## Public-comment summaries", "");
    for (const comment of response.publicComments.results) {
      lines.push(
        `### ${comment.speaker}`, "",
        `- [Extracted minutes, page ${comment.page}](${comment.transcriptUrl})`,
        `- [Focused Markdown excerpt](${comment.markdownUrl})`,
        `- [Official City PDF](${comment.officialUrl})`, "",
        `> ${comment.statement}`, "",
      );
    }
  }

  lines.push(
    "---",
    "Verification rule: cite the page-addressable transcript and verify decisive claims against the linked official City PDF.",
    "",
  );
  return lines.join("\n");
}

function relevantRollCalls(
  item: LegislativeItemResult,
  voter: string | null,
  position: VotePosition | null,
) {
  if (!voter) return item.rollCalls.slice(0, 4);
  const matching = item.rollCalls.filter((rollCall) => {
    const recorded = recordedPosition(rollCall, voter);
    return recorded && (!position || recorded.toLowerCase() === position);
  });
  return matching.length ? matching : item.rollCalls.slice(0, 2);
}

function recordedPosition(rollCall: RollCall, voter: string) {
  const key = voter.toLowerCase();
  for (const [position, names] of [
    ["Aye", rollCall.ayes],
    ["No", rollCall.noes],
    ["Absent", rollCall.absent],
    ["Excused", rollCall.excused],
  ] as const) {
    if (names.some((name) => name.toLowerCase() === key)) return position;
  }
  return null;
}

function rollCallMarkdown(rollCall: RollCall, voter: string | null) {
  const position = voter ? recordedPosition(rollCall, voter) : null;
  const lines = [
    `#### Vote ${rollCall.sequence}: ${rollCall.actionType}${rollCall.isFinal ? ", likely final" : ""}`,
    "",
    `- Action: ${rollCall.action.replace(/\s+/g, " ").trim() || "Action text unavailable."}`,
  ];
  if (voter) lines.push(`- ${voter}: ${position ?? "not recorded in this roll call"}`);
  if (!voter && rollCall.ayes.length) lines.push(`- Ayes: ${rollCall.ayes.join(", ")}`);
  if (!voter && rollCall.noes.length) lines.push(`- Noes: ${rollCall.noes.join(", ")}`);
  lines.push("");
  return lines;
}

function errorResponse(message: string, markdown: boolean) {
  if (markdown) return new Response(`# Evidence query error\n\n${message}.\n`, { status: 400, headers: markdownHeaders() });
  return Response.json({ error: message }, { status: 400, headers: publicHeaders() });
}

function publicHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    Link: '</llms.txt>; rel="describedby", </openapi.yaml>; rel="service-desc"; type="application/yaml"',
    "X-Robots-Tag": "noindex, follow",
  };
}

function markdownHeaders() {
  return { ...publicHeaders(), "Content-Type": "text/markdown; charset=utf-8" };
}
