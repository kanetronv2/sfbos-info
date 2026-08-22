import { neon } from "@neondatabase/serverless";
import { expandQuery } from "./query-expansion";
import type { PublicCommentResponse, PublicCommentResult } from "./comment-types";

interface CommentSearchOptions {
  query: string;
  speaker: string | null;
  fromYear: number;
  toYear: number;
  limit: number;
}

interface DatabaseRow {
  id: string;
  meeting_date: string;
  year: number;
  speaker: string;
  content: string;
  official_url: string;
  page_number: number;
  score: number;
  total_count: number;
}

export async function searchPublicComments(options: CommentSearchOptions): Promise<PublicCommentResponse> {
  const expanded = expandQuery(options.query);
  const empty = {
    query: options.query,
    interpretedQueries: expanded.interpreted,
    filters: { speaker: options.speaker, fromYear: options.fromYear, toYear: options.toYear },
  };
  if (!process.env.DATABASE_URL) return { ...empty, total: 0, returned: 0, results: [] };

  const sql = neon(process.env.DATABASE_URL);
  const variants = expanded.searchQueries;
  const params: Array<string | number> = [...variants];
  const queryExpression = variants
    .map((_, index) => `websearch_to_tsquery('english', $${index + 1})`)
    .join(" || ");
  params.push(options.fromYear, options.toYear);
  const filters = [
    `c.search_vector @@ (${queryExpression})`,
    `d.year BETWEEN $${variants.length + 1} AND $${variants.length + 2}`,
  ];
  if (options.speaker) {
    params.push(`%${options.speaker}%`);
    filters.push(`c.speaker ILIKE $${params.length}`);
  }
  params.push(options.limit);

  const rows = (await sql.query(
    `
      SELECT
        c.id::text,
        d.meeting_date::text,
        d.year,
        c.speaker,
        c.content,
        d.official_url,
        c.page_number,
        ts_rank_cd(c.search_vector, (${queryExpression}), 32)::float AS score,
        count(*) OVER()::int AS total_count
      FROM public_comments c
      JOIN documents d ON d.id = c.document_id
      WHERE ${filters.join(" AND ")}
      ORDER BY score DESC, d.meeting_date DESC, c.ordinal
      LIMIT $${params.length}
    `,
    params,
  )) as DatabaseRow[];

  const results: PublicCommentResult[] = rows.map((row) => ({
    id: row.id,
    meetingDate: row.meeting_date,
    year: row.year,
    speaker: row.speaker,
    statement: normalizeWhitespace(row.content),
    officialUrl: row.official_url,
    page: row.page_number,
    score: Number(row.score),
  }));
  return { ...empty, total: rows[0]?.total_count ?? 0, returned: results.length, results };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
