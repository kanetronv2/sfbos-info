import { neon } from "@neondatabase/serverless";
import type {
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
  fromYear: number;
  toYear: number;
  limit: number;
}

interface DatabaseRow {
  item_id: string;
  meeting_date: string;
  year: number;
  file_number: string;
  title: string;
  official_url: string;
  start_page: number;
  end_page: number;
  snippet: string;
  score: number;
  total_count: number;
  roll_calls: RollCall[];
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
  if (!process.env.DATABASE_URL) {
    return {
      query: options.query,
      filters: publicFilters(options),
      total: 0,
      returned: 0,
      results: [],
    };
  }

  const sql = neon(process.env.DATABASE_URL);
  const params: Array<string | number> = [options.query, options.fromYear, options.toYear];
  const filters = [
    "i.search_vector @@ websearch_to_tsquery('english', $1)",
    "d.year BETWEEN $2 AND $3",
  ];

  if (options.voterKey) {
    params.push(options.voterKey.toLowerCase());
    const voterPosition = params.length;
    const arrays = options.position
      ? `rc.${positionColumns[options.position]}`
      : "rc.ayes || rc.noes || rc.absent || rc.excused";
    filters.push(`
      EXISTS (
        SELECT 1
        FROM roll_calls rc
        CROSS JOIN LATERAL unnest(${arrays}) AS recorded_name
        WHERE rc.item_id = i.id AND lower(recorded_name) = $${voterPosition}
      )
    `);
  }

  params.push(options.limit);
  const limitPosition = params.length;
  const rows = (await sql.query(
    `
      WITH matched AS (
        SELECT
          i.id,
          d.meeting_date,
          d.year,
          i.file_number,
          i.title,
          d.official_url,
          i.start_page,
          i.end_page,
          ts_headline(
            'english',
            i.content || E'\n' || i.context,
            websearch_to_tsquery('english', $1),
            'StartSel=, StopSel=, MaxWords=80, MinWords=30, ShortWord=2, MaxFragments=2, FragmentDelimiter= … '
          ) AS snippet,
          ts_rank_cd(i.search_vector, websearch_to_tsquery('english', $1), 32)::float AS score,
          count(*) OVER()::int AS total_count
        FROM legislative_items i
        JOIN documents d ON d.id = i.document_id
        WHERE ${filters.join(" AND ")}
        ORDER BY score DESC, d.meeting_date DESC, i.ordinal
        LIMIT $${limitPosition}
      )
      SELECT
        matched.id::text AS item_id,
        matched.meeting_date::text,
        matched.year,
        matched.file_number,
        matched.title,
        matched.official_url,
        matched.start_page,
        matched.end_page,
        matched.snippet,
        matched.score,
        matched.total_count,
        coalesce(
          json_agg(
            json_build_object(
              'sequence', rc.sequence,
              'action', rc.action,
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
        matched.id, matched.meeting_date, matched.year, matched.file_number,
        matched.title, matched.official_url, matched.start_page, matched.end_page,
        matched.snippet, matched.score, matched.total_count
      ORDER BY matched.score DESC, matched.meeting_date DESC, matched.id
    `,
    params,
  )) as DatabaseRow[];

  const results: LegislativeItemResult[] = rows.map((row) => ({
    id: row.item_id,
    meetingDate: row.meeting_date,
    year: row.year,
    fileNumber: row.file_number,
    title: row.title,
    officialUrl: row.official_url,
    startPage: row.start_page,
    endPage: row.end_page,
    snippet: normalizeWhitespace(row.snippet),
    score: Number(row.score),
    rollCalls: row.roll_calls,
  }));

  return {
    query: options.query,
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
    fromYear: options.fromYear,
    toYear: options.toYear,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
