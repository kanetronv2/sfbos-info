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

  params.push(options.fromYear, options.toYear, options.query.toLowerCase());
  const fromPosition = queryVariants.length + 1;
  const toPosition = queryVariants.length + 2;
  const originalQueryPosition = queryVariants.length + 3;
  const normalizedFileNumber = options.query.replace(/^.*?#?(\d{6}).*$/, "$1");
  const hasFileNumber = /^\d{6}$/.test(normalizedFileNumber);
  const filters = [
    `(
      i.direct_search_vector @@ (${queryExpression})
      ${hasFileNumber ? `OR i.file_number = '${normalizedFileNumber}'` : ""}
    )`,
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
          (
            ts_rank_cd(i.direct_search_vector, (${queryExpression}), 32) * 1.8
            + ts_rank_cd(to_tsvector('english', coalesce(i.title, '')), (${queryExpression}), 32) * 3.2
            + CASE WHEN lower(i.title) LIKE '%' || $${originalQueryPosition} || '%' THEN 2.5 ELSE 0 END
            + CASE WHEN i.file_number = regexp_replace($${originalQueryPosition}, '\\D', '', 'g') THEN 8 ELSE 0 END
            + greatest(
                similarity(lower(i.title), $${originalQueryPosition}),
                word_similarity($${originalQueryPosition}, lower(i.title))
              ) * 0.7
            + CASE WHEN EXISTS (SELECT 1 FROM roll_calls final_rc WHERE final_rc.item_id = i.id AND final_rc.is_final) THEN 0.12 ELSE 0 END
          )::float AS score,
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

  if (!rows.length && /^[\p{L}\p{N}' -]+$/u.test(options.query) && options.query.split(/\s+/).length <= 6) {
    const correctedQuery = await correctSpelling(options.query);
    if (correctedQuery && correctedQuery.toLowerCase() !== options.query.toLowerCase()) {
      const corrected = await searchLegislativeItems({ ...options, query: correctedQuery });
      return {
        ...corrected,
        query: options.query,
        interpretedQueries: [correctedQuery, ...corrected.interpretedQueries].filter((value, index, values) => values.indexOf(value) === index),
      };
    }
  }

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

async function correctSpelling(query: string) {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  const tokens = query.split(/\s+/).filter(Boolean);
  const candidates = await sql.query(
    `SELECT DISTINCT lower(word) AS word
     FROM legislative_items i,
       LATERAL regexp_split_to_table(i.title, '[^[:alnum:]'']+') AS word
     WHERE length(word) BETWEEN 4 AND 24
       AND lower(left(word, 1)) = ANY($1::text[])
     LIMIT 12000`,
    [[...new Set(tokens.filter((token) => token.length >= 4).map((token) => token[0].toLowerCase()))]],
  );
  const words = candidates.map((row: Record<string, unknown>) => row.word as string);
  let changed = false;
  const corrected = tokens.map((token) => {
    if (token.length < 4 || words.includes(token.toLowerCase())) return token;
    const matches = words
      .filter((word) => Math.abs(word.length - token.length) <= 1)
      .map((word) => ({ word, distance: damerauLevenshtein(token.toLowerCase(), word) }))
      .filter((match) => match.distance <= 1)
      .sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word));
    if (!matches[0]) return token;
    changed = true;
    return matches[0].word;
  });
  return changed ? corrected.join(" ") : null;
}

function damerauLevenshtein(left: string, right: string) {
  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}
