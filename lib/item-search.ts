import { neon } from "@neondatabase/serverless";
import { extractItemFacts } from "./item-extraction";
import { documentFileUrl, documentMarkdownExcerptUrl } from "./document-url";
import { expandQuery } from "./query-expansion";
import type {
  ActionType,
  GroupBy,
  LegislativeItemResponse,
  LegislativeItemResult,
  RollCall,
  VotePosition,
} from "./item-types";

interface ItemSearchOptions {
  query: string;
  voter: string | null;
  voterKey: string | null;
  position: VotePosition | null;
  final: boolean;
  groupBy: GroupBy;
  fromYear: number;
  toYear: number;
  limit: number;
}

interface DatabaseRollCall {
  sequence: number;
  action: string;
  actionType: ActionType;
  isFinal: boolean;
  ayes: string[];
  noes: string[];
  absent: string[];
  excused: string[];
}

interface DatabaseRow {
  item_id: string;
  document_id: string;
  meeting_date: string;
  year: number;
  file_number: string;
  matter: string;
  title: string;
  content: string;
  official_url: string;
  start_page: number;
  end_page: number;
  snippet: string;
  score: number;
  group_count: number;
  total_count: number;
  extraction_confidence: number | null;
  parser_version: string | null;
  roll_calls: DatabaseRollCall[];
}

const positionColumns: Record<VotePosition, string> = {
  aye: "ayes",
  no: "noes",
  absent: "absent",
  excused: "excused",
};

export async function searchLegislativeItems(
  options: ItemSearchOptions,
): Promise<LegislativeItemResponse> {
  const expanded = expandQuery(options.query);
  if (!process.env.DATABASE_URL) {
    return {
      query: options.query,
      interpretedQueries: expanded.interpreted,
      filters: publicFilters(options),
      total: 0,
      returned: 0,
      results: [],
    };
  }

  const sql = neon(process.env.DATABASE_URL);
  const queryVariants = expanded.searchQueries;
  const params: Array<string | number> = [...queryVariants];
  const queryExpression = queryVariants
    .map((_, index) => `websearch_to_tsquery('english', $${index + 1})`)
    .join(" || ");

  params.push(options.fromYear, options.toYear);
  const fromPosition = queryVariants.length + 1;
  const toPosition = queryVariants.length + 2;
  const filters = [
    `i.direct_search_vector @@ (${queryExpression})`,
    `d.year BETWEEN $${fromPosition} AND $${toPosition}`,
  ];

  if (options.voterKey || options.final) {
    const rollCallFilters: string[] = ["rc.item_id = i.id"];
    if (options.final) {
      rollCallFilters.push(`rc.action !~ 'FIRST READING' AND rc.action ~ '(FINALLY PASSED|\\mADOPTED\\M|\\mAPPROVED\\M)'`);
    }
    if (options.voterKey) {
      params.push(options.voterKey.toLowerCase());
      const voterPosition = params.length;
      const arrays = options.position
        ? `rc.${positionColumns[options.position]}`
        : "rc.ayes || rc.noes || rc.absent || rc.excused";
      rollCallFilters.push(`EXISTS (
        SELECT 1 FROM unnest(${arrays}) AS recorded_name
        WHERE lower(recorded_name) = $${voterPosition}
      )`);
    }
    filters.push(`EXISTS (SELECT 1 FROM roll_calls rc WHERE ${rollCallFilters.join(" AND ")})`);
  }

  const groupExpression = {
    none: "i.id::text",
    file: "i.file_number",
    matter: "i.matter",
  }[options.groupBy];

  params.push(options.limit);
  const limitPosition = params.length;
  const rows = (await sql.query(
    `
      WITH candidates AS (
        SELECT
          i.id,
          i.document_id,
          d.meeting_date,
          d.year,
          i.file_number,
          i.matter,
          i.title,
          i.content,
          d.official_url,
          i.start_page,
          i.end_page,
          (SELECT max(es.confidence)::float FROM evidence_spans es
            WHERE es.entity_type = 'legislative-item' AND es.entity_id = i.id::text) AS extraction_confidence,
          (SELECT max(pr.parser_version) FROM evidence_spans es
            JOIN parser_runs pr ON pr.id = es.parser_run_id
            WHERE es.entity_type = 'legislative-item' AND es.entity_id = i.id::text) AS parser_version,
          ts_headline(
            'english',
            i.content,
            (${queryExpression}),
            'StartSel=, StopSel=, MaxWords=80, MinWords=30, ShortWord=2, MaxFragments=2, FragmentDelimiter= … '
          ) AS snippet,
          ts_rank_cd(i.direct_search_vector, (${queryExpression}), 32)::float AS score,
          row_number() OVER (
            PARTITION BY ${groupExpression}
            ORDER BY d.meeting_date DESC, i.ordinal DESC
          ) AS group_rank,
          count(*) OVER (PARTITION BY ${groupExpression})::int AS group_count
        FROM legislative_items i
        JOIN documents d ON d.id = i.document_id
        WHERE ${filters.join(" AND ")}
      ),
      grouped AS (
        SELECT candidates.*, count(*) OVER()::int AS total_count
        FROM candidates
        WHERE group_rank = 1
      ),
      matched AS (
        SELECT * FROM grouped
        ORDER BY score DESC, meeting_date DESC, id
        LIMIT $${limitPosition}
      )
      SELECT
        matched.id::text AS item_id,
        matched.document_id::text,
        matched.meeting_date::text,
        matched.year,
        matched.file_number,
        matched.matter,
        matched.title,
        matched.content,
        matched.official_url,
        matched.start_page,
        matched.end_page,
        matched.extraction_confidence,
        matched.parser_version,
        matched.snippet,
        matched.score,
        matched.group_count,
        matched.total_count,
        coalesce(
          json_agg(
            json_build_object(
              'sequence', rc.sequence,
              'action', rc.action,
              'actionType', CASE
                WHEN rc.action ~ 'FINALLY PASSED' THEN 'final-passage'
                WHEN rc.action ~ 'FIRST READING' THEN 'first-reading'
                WHEN rc.action ~ '\\mADOPTED\\M' THEN 'adoption'
                WHEN rc.action ~ '\\mAPPROVED\\M' THEN 'approval'
                WHEN rc.action ~* '\\mRESCIND' THEN 'rescission'
                WHEN rc.action ~* '\\mCONTINU' THEN 'continuance'
                WHEN rc.action ~* '\\mAMEND' THEN 'amendment'
                WHEN rc.action ~* '\\mREFER' THEN 'referral'
                WHEN rc.action ~* '\\mTABL' THEN 'tabling'
                WHEN rc.action ~* '\\m(REJECT|FAIL|DENI)' THEN 'rejection'
                ELSE 'other'
              END,
              'isFinal', rc.action !~ 'FIRST READING' AND rc.action ~ '(FINALLY PASSED|\\mADOPTED\\M|\\mAPPROVED\\M)',
              'ayes', rc.ayes,
              'noes', rc.noes,
              'absent', rc.absent,
              'excused', rc.excused
            ) ORDER BY rc.sequence
          ) FILTER (WHERE rc.id IS NOT NULL),
          '[]'::json
        ) AS roll_calls
      FROM matched
      LEFT JOIN roll_calls rc ON rc.item_id = matched.id
      GROUP BY
        matched.id, matched.document_id, matched.meeting_date, matched.year, matched.file_number, matched.matter,
        matched.title, matched.content, matched.official_url, matched.start_page, matched.end_page,
        matched.snippet, matched.score, matched.group_count, matched.total_count,
        matched.extraction_confidence, matched.parser_version
      ORDER BY matched.score DESC, matched.meeting_date DESC, matched.id
    `,
    params,
  )) as DatabaseRow[];

  const results: LegislativeItemResult[] = rows.map((row) => ({
    id: row.item_id,
    meetingDate: row.meeting_date,
    year: row.year,
    fileNumber: row.file_number,
    matter: row.matter,
    title: row.title,
    transcriptUrl: documentFileUrl(row.document_id, row.meeting_date, "minutes", row.file_number),
    markdownUrl: documentMarkdownExcerptUrl(
      row.document_id,
      row.meeting_date,
      "minutes",
      row.start_page,
      row.end_page,
    ),
    officialUrl: row.official_url,
    startPage: row.start_page,
    endPage: row.end_page,
    snippet: normalizeWhitespace(row.snippet),
    score: Number(row.score),
    groupCount: row.group_count,
    extractionConfidence: row.extraction_confidence === null ? null : Number(row.extraction_confidence),
    parserVersion: row.parser_version,
    extracted: extractItemFacts(row.title, row.content),
    rollCalls: row.roll_calls as RollCall[],
  }));

  return {
    query: options.query,
    interpretedQueries: expanded.interpreted,
    filters: publicFilters(options),
    total: rows[0]?.total_count ?? 0,
    returned: results.length,
    results,
  };
}

function publicFilters(options: ItemSearchOptions) {
  return {
    voter: options.voter,
    position: options.position,
    final: options.final,
    groupBy: options.groupBy,
    fromYear: options.fromYear,
    toYear: options.toYear,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
