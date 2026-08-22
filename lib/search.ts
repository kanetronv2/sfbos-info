import { neon } from "@neondatabase/serverless";
import { previewResults } from "./demo-data";
import { documentUrl } from "./document-url";
import { displayDocumentTitle } from "./document-title";
import { expandQuery } from "./query-expansion";
import type { DocumentKind, SearchResponse, SearchResult } from "./types";

interface SearchOptions {
  query: string;
  year: number | null;
  kind: DocumentKind | null;
  limit: number;
}

interface DatabaseRow {
  document_id: string;
  meeting_date: string;
  year: number;
  kind: DocumentKind;
  title: string;
  official_url: string;
  page_number: number;
  snippet: string;
  score: number;
  total_count: number;
}

export async function searchDocuments(options: SearchOptions): Promise<SearchResponse> {
  const expanded = expandQuery(options.query);
  if (!process.env.DATABASE_URL) return searchPreview(options);

  const sql = neon(process.env.DATABASE_URL);
  const variants = expanded.searchQueries;
  const params: Array<string | number> = [...variants];
  const queryExpression = variants
    .map((_, index) => `websearch_to_tsquery('english', $${index + 1})`)
    .join(" || ");
  const filters: string[] = [
    `p.search_vector @@ (${queryExpression})`,
  ];

  if (options.year) {
    params.push(options.year);
    filters.push(`d.year = $${params.length}`);
  }

  if (options.kind) {
    params.push(options.kind);
    filters.push(`d.kind = $${params.length}`);
  }

  params.push(options.limit);
  const limitPosition = params.length;
  const rows = (await sql.query(
    `
      SELECT
        d.id::text AS document_id,
        d.meeting_date::text,
        d.year,
        d.kind,
        d.title,
        d.official_url,
        p.page_number,
        ts_headline(
          'english',
          p.content,
            (${queryExpression}),
          'StartSel=, StopSel=, MaxWords=55, MinWords=22, ShortWord=2, HighlightAll=false'
        ) AS snippet,
        ts_rank_cd(p.search_vector, (${queryExpression}), 32)::float AS score,
        count(*) OVER()::int AS total_count
      FROM pages p
      JOIN documents d ON d.id = p.document_id
      WHERE ${filters.join(" AND ")}
      ORDER BY score DESC, d.meeting_date DESC, p.page_number ASC
      LIMIT $${limitPosition}
    `,
    params,
  )) as DatabaseRow[];

  const results: SearchResult[] = rows.map((row) => ({
    id: `${row.document_id}-${row.page_number}`,
    meetingDate: row.meeting_date,
    year: row.year,
    kind: row.kind,
    title: displayDocumentTitle(row.title),
    transcriptUrl: documentUrl(row.document_id, row.meeting_date, row.kind, row.page_number),
    officialUrl: row.official_url,
    page: row.page_number,
    snippet: normalizeWhitespace(row.snippet),
    score: Number(row.score),
  }));

  return {
    query: options.query,
    interpretedQueries: expanded.interpreted,
    filters: { year: options.year, kind: options.kind },
    total: rows[0]?.total_count ?? 0,
    returned: results.length,
    source: "postgres",
    results,
  };
}

function searchPreview(options: SearchOptions): SearchResponse {
  const expanded = expandQuery(options.query);
  const terms = options.query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = previewResults
    .filter((result) => !options.year || result.year === options.year)
    .filter((result) => !options.kind || result.kind === options.kind)
    .map((result) => {
      const haystack = `${result.title} ${result.snippet}`.toLowerCase();
      const matches = terms.filter((term) => haystack.includes(term)).length;
      return { result, matches };
    })
    .filter(({ matches }) => matches > 0)
    .sort((a, b) => b.matches - a.matches || b.result.score - a.result.score)
    .slice(0, options.limit)
    .map(({ result }) => result);

  return {
    query: options.query,
    interpretedQueries: expanded.interpreted,
    filters: { year: options.year, kind: options.kind },
    total: results.length,
    returned: results.length,
    source: "preview",
    results,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
