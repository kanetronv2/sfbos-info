import { neon } from "@neondatabase/serverless";
import { searchPublicComments } from "./comment-search";
import { documentFileUrl, documentMarkdownExcerptUrl } from "./document-url";
import { retrieveSemanticReferences } from "./embeddings";
import { extractItemFacts } from "./item-extraction";
import { searchLegislativeItems } from "./item-search";
import { searchDocuments } from "./search";
import { interpretSearchQuestion } from "./search-intent";
import type { DocumentKind, SearchResponse, SearchResult, SearchResultType } from "./types";
import type { VotePosition } from "./item-types";

export interface UnifiedSearchOptions {
  query: string;
  year: number | null;
  kind: DocumentKind | null;
  type: SearchResultType;
  fromYear: number | null;
  toYear: number | null;
  supervisor: string | null;
  position: VotePosition | null;
  final: boolean;
  limit: number;
  mode: "lexical" | "hybrid";
}

export async function searchAllRecords(options: UnifiedSearchOptions): Promise<SearchResponse> {
  const intent = interpretSearchQuestion(options.query);
  const searchQuery = intent.searchQuery;
  const fromYear = options.year ?? options.fromYear ?? intent.fromYear;
  const toYear = options.year ?? options.toYear ?? intent.toYear;
  const supervisor = options.supervisor ?? intent.voter;
  const position = options.position ?? intent.recordedPosition;
  const final = options.final || intent.finalOnly;
  const requestedType = options.type;
  const candidateLimit = Math.min(50, Math.max(options.limit * 2, 24));

  const includeItems = requestedType === "all" || requestedType === "legislation" || requestedType === "votes";
  const includeComments = requestedType === "comments" || (requestedType === "all" && (!intent.voteIntent || intent.commentIntent));
  const includePages = requestedType === "all" || requestedType === "pages";

  const [items, comments, pages, semantic, entityMatches] = await Promise.all([
    includeItems
      ? searchLegislativeItems({
          query: searchQuery,
          voter: supervisor,
          voterKey: supervisor?.toLowerCase() ?? null,
          position,
          final,
          groupBy: "file",
          fromYear,
          toYear,
          limit: candidateLimit,
        })
      : null,
    includeComments
      ? searchPublicComments({ query: searchQuery, speaker: null, fromYear, toYear, limit: candidateLimit })
      : null,
    includePages
      ? searchDocuments({
          query: searchQuery,
          year: options.year,
          fromYear,
          toYear,
          kind: options.kind ?? (intent.voteIntent ? "minutes" : null),
          limit: candidateLimit,
          mode: "lexical",
        })
      : null,
    options.mode === "hybrid"
      ? retrieveSemanticReferences(searchQuery, ["legislative-item"], candidateLimit)
      : Promise.resolve({ references: [], model: null, fallbackReason: null }),
    includeItems ? searchEntityMatches(searchQuery, candidateLimit) : Promise.resolve(new Map<string, string[]>()),
  ]);

  const itemResults = (items?.results ?? []).map((item): SearchResult => {
    const matchingRollCall = chooseRollCall(item.rollCalls, supervisor, position, final);
    const recordedPosition = matchingRollCall && supervisor
      ? findRecordedPosition(matchingRollCall, supervisor)
      : undefined;
    return {
      id: `legislation:${item.fileNumber}`,
      resultType: requestedType === "votes" || (requestedType === "all" && intent.voteIntent) ? "votes" : "legislation",
      meetingDate: item.meetingDate,
      year: item.year,
      kind: "minutes",
      title: item.title,
      matter: item.matter,
      transcriptUrl: item.transcriptUrl,
      markdownUrl: item.markdownUrl,
      officialUrl: item.officialUrl,
      page: item.startPage,
      fileNumber: item.fileNumber,
      snippet: item.snippet,
      score: item.score + (entityMatches.has(item.fileNumber) ? 1.25 : 0),
      lexicalScore: item.score,
      groupCount: item.groupCount,
      action: matchingRollCall?.action,
      actionType: matchingRollCall?.actionType,
      isFinal: matchingRollCall?.isFinal,
      recordedPosition,
      ayes: matchingRollCall?.ayes,
      noes: matchingRollCall?.noes,
      absent: matchingRollCall?.absent,
      excused: matchingRollCall?.excused,
      extracted: item.extracted,
      matchedEntities: entityMatches.get(item.fileNumber),
    };
  }).sort((a, b) => b.score - a.score);

  const commentResults = (comments?.results ?? []).map((comment): SearchResult => ({
    id: `comment:${comment.id}`,
    resultType: "comments",
    meetingDate: comment.meetingDate,
    year: comment.year,
    kind: "minutes",
    title: `Public comment by ${comment.speaker}`,
    speaker: comment.speaker,
    transcriptUrl: comment.transcriptUrl,
    markdownUrl: comment.markdownUrl,
    officialUrl: comment.officialUrl,
    page: comment.page,
    snippet: shorten(comment.statement, 520),
    score: comment.score,
    lexicalScore: comment.score,
  }));

  const pageResults = (pages?.results ?? []).map((page): SearchResult => ({
    ...page,
    id: `page:${page.id}`,
    resultType: "pages",
    lexicalScore: page.score,
  }));

  const lexical = [...itemResults, ...commentResults, ...pageResults];
  const semanticCandidates = semantic.references.length
    ? await loadSemanticItemCandidates(semantic.references.map((reference) => reference.entityKey))
    : [];
  const merged = mergeRankings(lexical, semanticCandidates, semantic.references, requestedType, options.limit);
  const facets = {
    legislation: itemResults.filter((result) => result.resultType === "legislation").length,
    votes: itemResults.filter((result) => result.resultType === "votes").length,
    comments: commentResults.length,
    pages: pageResults.length,
  };

  return {
    query: options.query,
    interpretedQueries: [searchQuery, ...(items?.interpretedQueries ?? []), ...(pages?.interpretedQueries ?? [])]
      .filter((value, index, values) => value !== options.query && values.indexOf(value) === index)
      .slice(0, 8),
    filters: {
      year: options.year,
      kind: options.kind,
      type: requestedType,
      fromYear,
      toYear,
      supervisor,
      position,
      final,
    },
    intent: {
      searchQuery,
      suggestedType: intent.suggestedType,
      voteIntent: intent.voteIntent,
      commentIntent: intent.commentIntent,
      housingIntent: intent.housingIntent,
    },
    facets,
    correction: null,
    total: requestedType === "all"
      ? (items?.total ?? 0) + (comments?.total ?? 0) + (pages?.total ?? 0)
      : requestedType === "comments"
        ? comments?.total ?? 0
        : requestedType === "pages"
          ? pages?.total ?? 0
          : items?.total ?? 0,
    returned: merged.length,
    source: process.env.DATABASE_URL ? "postgres" : "preview",
    retrieval: {
      requested: options.mode,
      used: options.mode === "hybrid" && semantic.references.length ? "hybrid" : "lexical",
      embeddingModel: semantic.model,
      semanticCoverage: semantic.references.length
        ? semanticCandidates.length / semantic.references.length
        : 0,
      fallbackReason: options.mode === "hybrid" ? semantic.fallbackReason : null,
    },
    results: merged,
  };
}

function chooseRollCall(
  rollCalls: Array<{ action: string; actionType: string; isFinal: boolean; ayes: string[]; noes: string[]; absent: string[]; excused: string[] }>,
  supervisor: string | null,
  position: VotePosition | null,
  final: boolean,
) {
  return rollCalls.find((rollCall) => {
    if (final && !rollCall.isFinal) return false;
    if (!supervisor) return true;
    const recorded = findRecordedPosition(rollCall, supervisor);
    return recorded && (!position || recorded === position);
  }) ?? rollCalls.find((rollCall) => rollCall.isFinal) ?? rollCalls[0];
}

function findRecordedPosition(
  rollCall: { ayes: string[]; noes: string[]; absent: string[]; excused: string[] },
  supervisor: string,
): VotePosition | undefined {
  const key = supervisor.toLowerCase();
  for (const [position, names] of [
    ["aye", rollCall.ayes], ["no", rollCall.noes], ["absent", rollCall.absent], ["excused", rollCall.excused],
  ] as const) {
    if (names.some((name) => name.toLowerCase() === key)) return position;
  }
  return undefined;
}

function mergeRankings(
  lexical: SearchResult[],
  semanticCandidates: SearchResult[],
  semanticReferences: Array<{ entityKey: string; score: number }>,
  requestedType: SearchResultType,
  limit: number,
) {
  const merged = new Map<string, SearchResult & { fusionScore: number }>();
  lexical.forEach((result, index) => {
    const typeBoost = result.resultType === "legislation" || result.resultType === "votes" ? 0.008 : 0;
    merged.set(result.id, { ...result, fusionScore: 1 / (60 + index + 1) + typeBoost });
  });
  const semanticByKey = new Map(semanticReferences.map((reference, index) => [reference.entityKey, { ...reference, rank: index + 1 }]));
  for (const candidate of semanticCandidates) {
    const reference = semanticByKey.get(candidate.id.replace("legislation:item:", ""));
    if (!reference) continue;
    const key = candidate.fileNumber ? `legislation:${candidate.fileNumber}` : candidate.id;
    const current = merged.get(key);
    if (current) {
      current.fusionScore += 0.8 / (60 + reference.rank);
      current.semanticScore = reference.score;
    } else if (requestedType === "all" || requestedType === "legislation" || requestedType === "votes") {
      merged.set(key, {
        ...candidate,
        id: key,
        semanticScore: reference.score,
        fusionScore: 0.8 / (60 + reference.rank) + 0.008,
      });
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.fusionScore - a.fusionScore || b.score - a.score || b.meetingDate.localeCompare(a.meetingDate))
    .slice(0, limit)
    .map(({ fusionScore, ...result }) => ({ ...result, score: fusionScore }));
}

async function loadSemanticItemCandidates(ids: string[]): Promise<SearchResult[]> {
  if (!process.env.DATABASE_URL || !ids.length) return [];
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(
    `SELECT i.id::text, i.document_id::text, d.meeting_date::text, d.year, i.file_number,
            i.title, i.matter, i.content, i.start_page, i.end_page, d.official_url
     FROM legislative_items i JOIN documents d ON d.id = i.document_id
     WHERE i.id::text = ANY($1::text[])`,
    [ids],
  );
  return rows.map((row) => ({
    id: `legislation:item:${row.id}`,
    resultType: "legislation" as const,
    meetingDate: row.meeting_date as string,
    year: Number(row.year),
    kind: "minutes" as const,
    title: row.title as string,
    matter: row.matter as string,
    transcriptUrl: documentFileUrl(row.document_id as string, row.meeting_date as string, "minutes", row.file_number as string),
    markdownUrl: documentMarkdownExcerptUrl(row.document_id as string, row.meeting_date as string, "minutes", Number(row.start_page), Number(row.end_page)),
    officialUrl: row.official_url as string,
    page: Number(row.start_page),
    fileNumber: row.file_number as string,
    snippet: shorten(row.content as string, 520),
    score: 0,
    extracted: extractItemFacts(row.title as string, row.content as string),
  }));
}

async function searchEntityMatches(query: string, limit: number) {
  const matches = new Map<string, string[]>();
  if (!process.env.DATABASE_URL) return matches;
  const sql = neon(process.env.DATABASE_URL);
  const [availability] = await sql.query(`SELECT to_regclass('public.search_entities')::text AS table_name`);
  if (!availability?.table_name) return matches;
  const normalized = query.toLowerCase()
    .replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd")
    .replace(/["()]/g, " ").replace(/\bOR\b/gi, " ").replace(/\s+/g, " ").trim();
  const rows = await sql.query(
    `SELECT i.file_number,
            array_agg(DISTINCT se.display_value ORDER BY se.display_value) AS matched_values,
            max(greatest(similarity(se.normalized_value, $2), word_similarity($2, se.normalized_value)))::float AS score
     FROM search_entities se JOIN legislative_items i ON i.id = se.legislative_item_id
     WHERE se.search_vector @@ websearch_to_tsquery('english', $1)
        OR se.normalized_value LIKE '%' || $2 || '%'
        OR word_similarity($2, se.normalized_value) >= 0.62
     GROUP BY i.file_number ORDER BY score DESC LIMIT $3`,
    [query, normalized, limit],
  );
  for (const row of rows) matches.set(row.file_number as string, (row.matched_values as string[]).slice(0, 5));
  return matches;
}

function shorten(value: string, length: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length).replace(/\s+\S*$/, "")}…` : normalized;
}
