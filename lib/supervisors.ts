import { neon } from "@neondatabase/serverless";
import { cache } from "react";
import { documentFileUrl, documentMarkdownExcerptUrl } from "./document-url";
import { getSupervisorDistrict } from "./supervisor-districts";
import { getOfficialSupervisorPortrait } from "./supervisor-official-data";

export interface SupervisorSummary {
  slug: string;
  displayName: string;
  familyName: string;
  district: string | null;
  active: boolean;
  termStart: string | null;
  termEnd: string | null;
  officialUrl: string | null;
  firstRecordedDate: string | null;
  lastRecordedDate: string | null;
  recordedPositions: number;
}

export interface SupervisorNameLink {
  slug: string;
  displayName: string;
  names: string[];
}

export interface SupervisorContact {
  email: string;
  phone: string;
  address: string;
  officialUrl: string;
  sourceUrl: string;
  portraitUrl: string | null;
}

export type SupervisorPosition = "aye" | "no" | "absent" | "excused";

export interface SupervisorVote {
  id: string;
  position: SupervisorPosition;
  confidence: number;
  recordedName: string;
  summary: string | null;
  summaryModel: string | null;
  action: string;
  actionType: string;
  isFinal: boolean;
  fileNumber: string;
  title: string;
  meetingDate: string;
  startPage: number;
  transcriptUrl: string;
  markdownUrl: string;
  officialUrl: string;
  ayes: string[];
  noes: string[];
  absent: string[];
  excused: string[];
}

export interface SupervisorProfile extends SupervisorSummary {
  aliases: Array<{ alias: string; confidence: number; source: string }>;
  counts: Record<SupervisorPosition, number>;
  votes: SupervisorVote[];
  parserVersions: string[];
  contact: SupervisorContact | null;
}

export const listSupervisors = cache(async (): Promise<SupervisorSummary[]> => {
  if (!process.env.DATABASE_URL) return [];
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(
    `SELECT
       s.slug, s.display_name, s.family_name, s.district, s.active,
       s.term_start::text, s.term_end::text, s.metadata,
       min(d.meeting_date)::text AS first_recorded_date,
       max(d.meeting_date)::text AS last_recorded_date,
       count(rcp.id)::int AS recorded_positions
     FROM supervisors s
     LEFT JOIN roll_call_positions rcp ON rcp.supervisor_id = s.id
     LEFT JOIN roll_calls rc ON rc.id = rcp.roll_call_id
     LEFT JOIN legislative_items i ON i.id = rc.item_id
     LEFT JOIN documents d ON d.id = i.document_id
     GROUP BY s.id
     ORDER BY
       s.active DESC,
       CASE WHEN s.active AND s.district ~ '^[0-9]+$' THEN s.district::int END NULLS LAST,
       s.family_name,
       s.display_name`,
    [],
  );
  return rows.map((row) => ({
    slug: row.slug,
    displayName: row.display_name,
    familyName: row.family_name,
    district: getSupervisorDistrict(row.slug, row.district),
    active: row.active,
    termStart: row.term_start,
    termEnd: row.term_end,
    officialUrl: parseOfficialUrl(row.metadata),
    firstRecordedDate: row.first_recorded_date,
    lastRecordedDate: row.last_recorded_date,
    recordedPositions: row.recorded_positions,
  }));
});

export const listSupervisorNameLinks = cache(async (): Promise<SupervisorNameLink[]> => {
  if (!process.env.DATABASE_URL) return [];
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(
    `SELECT s.slug, s.display_name, s.family_name,
       coalesce(array_agg(a.alias ORDER BY length(a.alias) DESC)
         FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS aliases
     FROM supervisors s
     LEFT JOIN supervisor_aliases a ON a.supervisor_id = s.id
     GROUP BY s.id
     ORDER BY s.family_name, s.display_name`,
    [],
  );
  return rows.map((row) => {
    const displayParts = String(row.display_name).split(/\s+/);
    const shortDisplayName = displayParts.length > 2
      ? `${displayParts[0]} ${displayParts.at(-1)}`
      : row.display_name;
    return {
      slug: row.slug,
      displayName: row.display_name,
      names: [...new Set([
        row.display_name,
        shortDisplayName,
        row.family_name,
        ...(row.aliases as string[]),
      ].filter(Boolean))],
    };
  });
});

export const getSupervisor = cache(async (slug: string, position?: SupervisorPosition): Promise<SupervisorProfile | null> => {
  if (!process.env.DATABASE_URL || !/^[a-z0-9-]+$/.test(slug)) return null;
  const sql = neon(process.env.DATABASE_URL);
  const [supervisor] = await sql.query(
    `SELECT id::text, slug, display_name, family_name, district, active,
       term_start::text, term_end::text, metadata
     FROM supervisors WHERE slug = $1`,
    [slug],
  );
  if (!supervisor) return null;

  const [aliases, countRows, voteRows, parserRows] = await Promise.all([
    sql.query(
      `SELECT alias, confidence::float, source FROM supervisor_aliases
       WHERE supervisor_id = $1 ORDER BY confidence DESC, alias`,
      [supervisor.id],
    ),
    sql.query(
      `SELECT rcp.position, count(*)::int AS count,
         min(d.meeting_date)::text AS first_recorded_date,
         max(d.meeting_date)::text AS last_recorded_date
       FROM roll_call_positions rcp
       JOIN roll_calls rc ON rc.id = rcp.roll_call_id
       JOIN legislative_items i ON i.id = rc.item_id
       JOIN documents d ON d.id = i.document_id
       WHERE rcp.supervisor_id = $1 GROUP BY rcp.position`,
      [supervisor.id],
    ),
    sql.query(
      `SELECT
         rcp.id::text, rcp.position, rcp.confidence::float, rcp.recorded_name,
         rc.action, rc.action_type, rc.is_final, rc.ayes, rc.noes, rc.absent, rc.excused,
         rcs.summary, rcs.model AS summary_model,
         i.file_number, i.title,
         d.id::text AS document_id, d.meeting_date::text, d.official_url,
         i.start_page, i.end_page
       FROM roll_call_positions rcp
       JOIN roll_calls rc ON rc.id = rcp.roll_call_id
       LEFT JOIN roll_call_summaries rcs ON rcs.roll_call_id = rc.id
       JOIN legislative_items i ON i.id = rc.item_id
       JOIN documents d ON d.id = i.document_id
       WHERE rcp.supervisor_id = $1
         AND ($2::text IS NULL OR rcp.position = $2)
       ORDER BY d.meeting_date DESC, i.ordinal DESC, rc.sequence DESC
       LIMIT 250`,
      [supervisor.id, position ?? null],
    ),
    sql.query(
      `SELECT DISTINCT pr.parser_version
       FROM roll_call_positions rcp
       JOIN roll_calls rc ON rc.id = rcp.roll_call_id
       JOIN legislative_items i ON i.id = rc.item_id
       JOIN evidence_spans es ON es.entity_type = 'legislative-item' AND es.entity_id = i.id::text
       JOIN parser_runs pr ON pr.id = es.parser_run_id
       WHERE rcp.supervisor_id = $1
       ORDER BY pr.parser_version DESC`,
      [supervisor.id],
    ),
  ]);

  const firstDates = countRows.map((row) => row.first_recorded_date).filter(Boolean).sort();
  const lastDates = countRows.map((row) => row.last_recorded_date).filter(Boolean).sort();
  const counts = { aye: 0, no: 0, absent: 0, excused: 0 };
  for (const row of countRows) counts[row.position as keyof typeof counts] = row.count;

  return {
    slug: supervisor.slug,
    displayName: supervisor.display_name,
    familyName: supervisor.family_name,
    district: getSupervisorDistrict(supervisor.slug, supervisor.district),
    active: supervisor.active,
    termStart: supervisor.term_start,
    termEnd: supervisor.term_end,
    officialUrl: parseOfficialUrl(supervisor.metadata),
    firstRecordedDate: firstDates[0] ?? null,
    lastRecordedDate: lastDates.at(-1) ?? null,
    recordedPositions: Object.values(counts).reduce((sum, value) => sum + value, 0),
    aliases: aliases.map((row) => ({ alias: row.alias, confidence: Number(row.confidence), source: row.source })),
    counts,
    parserVersions: parserRows.map((row) => row.parser_version),
    contact: parseContact(supervisor.metadata?.contact, supervisor.slug),
    votes: voteRows.map((row) => ({
      id: row.id,
      position: row.position,
      confidence: Number(row.confidence),
      recordedName: row.recorded_name,
      summary: row.summary ?? null,
      summaryModel: row.summary_model ?? null,
      action: row.action,
      actionType: row.action_type,
      isFinal: row.is_final,
      fileNumber: row.file_number,
      title: row.title,
      meetingDate: row.meeting_date,
      startPage: row.start_page,
      transcriptUrl: documentFileUrl(row.document_id, row.meeting_date, "minutes", row.file_number),
      markdownUrl: documentMarkdownExcerptUrl(row.document_id, row.meeting_date, "minutes", row.start_page, row.end_page),
      officialUrl: row.official_url,
      ayes: row.ayes ?? [],
      noes: row.noes ?? [],
      absent: row.absent ?? [],
      excused: row.excused ?? [],
    })),
  };
});

function parseContact(value: unknown, slug: string): SupervisorContact | null {
  if (!value || typeof value !== "object") return null;
  const contact = value as Record<string, unknown>;
  const fields = ["email", "phone", "address", "officialUrl", "sourceUrl"] as const;
  if (!fields.every((field) => typeof contact[field] === "string" && contact[field])) return null;
  return {
    ...Object.fromEntries(fields.map((field) => [field, contact[field]])),
    portraitUrl: typeof contact.portraitUrl === "string" && contact.portraitUrl
      ? contact.portraitUrl
      : getOfficialSupervisorPortrait(slug),
  } as SupervisorContact;
}

function parseOfficialUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const metadata = value as Record<string, unknown>;
  return typeof metadata.officialUrl === "string" && metadata.officialUrl ? metadata.officialUrl : null;
}
