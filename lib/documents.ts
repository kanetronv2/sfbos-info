import { neon } from "@neondatabase/serverless";
import { cache } from "react";
import { displayDocumentTitle } from "./document-title";
import { documentPath } from "./document-url";
import type { RollCall } from "./item-types";
import type { DocumentKind } from "./types";

export interface ArchiveDocument {
  id: string;
  meetingDate: string;
  year: number;
  kind: DocumentKind;
  title: string;
  officialUrl: string;
  transcriptPath: string;
  pageCount: number;
}

export interface EvidencePage {
  pageNumber: number;
  content: string;
}

export interface EvidenceItem {
  id: string;
  fileNumber: string;
  title: string;
  startPage: number;
  endPage: number;
  rollCalls: RollCall[];
}

export interface DocumentEvidence extends ArchiveDocument {
  pages: EvidencePage[];
  items: EvidenceItem[];
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

interface PageRow {
  page_number: number;
  content: string;
}

interface ItemRow {
  id: string;
  file_number: string;
  title: string;
  start_page: number;
  end_page: number;
  roll_calls: RollCall[];
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
    title: displayDocumentTitle(row.title),
    officialUrl: row.official_url,
    transcriptPath: documentPath(row.id, row.meeting_date, row.kind),
    pageCount: row.page_count,
  }));
}

export const getDocumentEvidence = cache(async (id: string): Promise<DocumentEvidence | null> => {
  if (!process.env.DATABASE_URL || !/^\d+$/.test(id)) return null;
  const sql = neon(process.env.DATABASE_URL);
  const [document] = (await sql.query(
    `
      SELECT id::text, meeting_date::text, year, kind, title, official_url, page_count
      FROM documents
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  )) as DatabaseRow[];
  if (!document) return null;

  const [rawPageRows, rawItemRows] = await Promise.all([
    sql.query(
      "SELECT page_number, content FROM pages WHERE document_id = $1 ORDER BY page_number",
      [id],
    ),
    sql.query(
      `
        SELECT
          i.id::text,
          i.file_number,
          i.title,
          i.start_page,
          i.end_page,
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
        FROM legislative_items i
        LEFT JOIN roll_calls rc ON rc.item_id = i.id
        WHERE i.document_id = $1
        GROUP BY i.id
        ORDER BY i.ordinal
      `,
      [id],
    ),
  ]);
  const pageRows = rawPageRows as unknown as PageRow[];
  const itemRows = rawItemRows as unknown as ItemRow[];

  return {
    id: document.id,
    meetingDate: document.meeting_date,
    year: document.year,
    kind: document.kind,
    title: displayDocumentTitle(document.title),
    officialUrl: document.official_url,
    transcriptPath: documentPath(document.id, document.meeting_date, document.kind),
    pageCount: document.page_count,
    pages: pageRows.map((page) => ({ pageNumber: page.page_number, content: page.content })),
    items: itemRows.map((item) => ({
      id: item.id,
      fileNumber: item.file_number,
      title: item.title,
      startPage: item.start_page,
      endPage: item.end_page,
      rollCalls: item.roll_calls,
    })),
  };
});
