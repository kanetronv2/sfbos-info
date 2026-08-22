import { neon } from "@neondatabase/serverless";
import type { DocumentKind } from "./types";

export interface ArchiveDocument {
  id: string;
  meetingDate: string;
  year: number;
  kind: DocumentKind;
  title: string;
  officialUrl: string;
  pageCount: number;
}

interface DatabaseRow {
  id: string;
  meeting_date: string;
  year: number;
  kind: DocumentKind;
  title: string;
  official_url: string;
  page_count: number;
}

export async function listDocuments(): Promise<ArchiveDocument[]> {
  if (!process.env.DATABASE_URL) return [];
  const sql = neon(process.env.DATABASE_URL);
  const rows = (await sql.query(
    `
      SELECT
        id::text,
        meeting_date::text,
        year,
        kind,
        title,
        official_url,
        page_count
      FROM documents
      ORDER BY meeting_date DESC, CASE kind WHEN 'agenda' THEN 1 ELSE 2 END, id DESC
    `,
    [],
  )) as DatabaseRow[];

  return rows.map((row) => ({
    id: row.id,
    meetingDate: row.meeting_date,
    year: row.year,
    kind: row.kind,
    title: row.title,
    officialUrl: row.official_url,
    pageCount: row.page_count,
  }));
}
