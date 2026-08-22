import { searchPublicComments } from "./comment-search";
import { searchLegislativeItems } from "./item-search";
import { searchDocuments } from "./search";
import type { LegislativeItemResult, RollCall } from "./item-types";

const MIN_YEAR = 2012;
const MAX_YEAR = 2026;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 500;

const supervisorNames = [
  "Avalos", "Breed", "Brown", "Campos", "Chan", "Christensen", "Chiu", "Chu", "Cohen",
  "Dorsey", "Elsbernd", "Engardio", "Farrell", "Fewer", "Fielder", "Haney", "Kim", "Mahmood",
  "Mandelman", "Mar", "Melgar", "Olague", "Peskin", "Preston", "Ronen", "Safai", "Sauter",
  "Sheehy", "Stefani", "Tang", "Walton", "Wiener", "Yee",
];

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

  const interpretation = interpretQuestion(question);
  const [items, pages, comments] = await Promise.all([
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
  };

  if (markdown) return new Response(toMarkdown(response), { headers: markdownHeaders() });
  return Response.json(response, { headers: publicHeaders() });
}

function interpretQuestion(question: string) {
  const withoutUrl = question.replace(/https?:\/\/\S+/gi, " ");
  const voter = supervisorNames.find((name) => new RegExp(`\\b${name}\\b`, "i").test(withoutUrl)) ?? null;
  const years = [...withoutUrl.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= MIN_YEAR && year <= MAX_YEAR);
  const housingIntent = /\b(?:housing|dwelling|residential)\s+units?\b|\bhousing\b/i.test(withoutUrl);
  const commentIntent = /\b(?:public comment|commenter|speaker|testif(?:y|ied|ies))\b/i.test(withoutUrl);
  const voteIntent = /\b(?:vote|voted|ayes?|noes?|against|support|oppose|passed|approved)\b/i.test(withoutUrl);
  const finalOnly = /\b(?:final|finally|enacted|adopted)\b/i.test(withoutUrl);
  const recordedPosition = /\b(?:against|oppos(?:e|ed|ition)|voted?\s+no)\b/i.test(withoutUrl)
    ? "no" as const
    : /\b(?:support(?:ed)?|voted?\s+aye|voted?\s+yes)\b/i.test(withoutUrl)
      ? "aye" as const
      : null;

  let searchQuery: string;
  if (housingIntent) {
    searchQuery = '"dwelling units" OR "residential unit" OR "housing units"';
  } else {
    searchQuery = withoutUrl
      .replace(voter ? new RegExp(`\\b${voter}\\b`, "gi") : /$^/, " ")
      .replace(/\b(?:how|many|much|what|when|where|which|who|why|did|does|has|have|use|find|show|tell|address|addresses|vote|voted|against|support|supported|oppose|opposed)\b/gi, " ")
      .replace(/\b20\d{2}\b/g, " ")
      .replace(/[^\p{L}\p{N}'"-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (searchQuery.length < 2) searchQuery = withoutUrl.trim();
  }

  return {
    searchQuery,
    voter,
    recordedPosition,
    fromYear: years.length ? Math.min(...years) : MIN_YEAR,
    toYear: years.length ? Math.max(...years) : MAX_YEAR,
    voteIntent,
    housingIntent,
    commentIntent,
    finalOnly,
  };
}

type EvidenceResponse = {
  question: string;
  interpretation: ReturnType<typeof interpretQuestion>;
  legislativeItems: Awaited<ReturnType<typeof searchLegislativeItems>>;
  pageMatches: Awaited<ReturnType<typeof searchDocuments>>;
  publicComments: Awaited<ReturnType<typeof searchPublicComments>> | null;
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

  for (const [index, item] of response.legislativeItems.results.entries()) {
    lines.push(
      `### ${index + 1}. File ${item.fileNumber}: [${item.title}](${item.transcriptUrl})`,
      "",
      `- Meeting: ${item.meetingDate}`,
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
  position: "aye" | "no" | null,
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
    "X-Robots-Tag": "noindex, follow",
  };
}

function markdownHeaders() {
  return { ...publicHeaders(), "Content-Type": "text/markdown; charset=utf-8" };
}
