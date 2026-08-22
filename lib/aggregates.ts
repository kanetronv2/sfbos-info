import { neon } from "@neondatabase/serverless";
import { documentFileUrl, documentMarkdownExcerptUrl } from "./document-url";
import { extractItemFacts } from "./item-extraction";
import type { VotePosition } from "./item-types";

export interface AggregateOptions {
  voter: string;
  position: VotePosition | null;
  fromYear: number;
  toYear: number;
  finalOnly: boolean;
  groupBy: "file" | "roll-call";
  housingOnly?: boolean;
  limit: number;
}

export async function aggregateRecordedVotes(options: AggregateOptions) {
  if (!process.env.DATABASE_URL) return emptyAggregate(options, "DATABASE_URL is not configured");
  const sql = neon(process.env.DATABASE_URL);
  const normalized = options.voter.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const [identity] = await sql.query(
    `SELECT s.id::text, s.slug, s.display_name
     FROM supervisor_aliases a JOIN supervisors s ON s.id = a.supervisor_id
     WHERE a.normalized_alias = $1
     UNION ALL
     SELECT id::text, slug, display_name FROM supervisors WHERE slug = $2
     LIMIT 1`,
    [normalized, options.voter.toLowerCase()],
  );
  if (!identity) return emptyAggregate(options, `No reconciled supervisor matched ${options.voter}`);

  const params: Array<string | number | boolean> = [identity.id, options.fromYear, options.toYear];
  const filters = ["rcp.supervisor_id = $1", "d.year BETWEEN $2 AND $3"];
  if (options.position) {
    params.push(options.position);
    filters.push(`rcp.position = $${params.length}`);
  }
  if (options.finalOnly) filters.push("rc.is_final = true");
  if (options.housingOnly) {
    filters.push(`i.direct_search_vector @@ websearch_to_tsquery('english', $${params.length + 1})`);
    params.push('"dwelling units" OR "residential units" OR "housing units" OR "unit development"');
  }
  params.push(options.limit);
  const partition = options.groupBy === "file" ? "i.file_number" : "rcp.id::text";
  const rows = await sql.query(
    `WITH matched AS (
       SELECT
         rcp.id, rcp.position, rcp.recorded_name, rcp.confidence::float,
         rc.action, rc.action_type, rc.is_final, i.file_number, i.title, i.content,
         i.start_page, i.end_page, d.id AS document_id, d.meeting_date::text AS meeting_date, d.year,
         d.official_url,
         row_number() OVER (PARTITION BY ${partition} ORDER BY d.meeting_date DESC, rc.sequence DESC) AS group_rank
       FROM roll_call_positions rcp
       JOIN roll_calls rc ON rc.id = rcp.roll_call_id
       JOIN legislative_items i ON i.id = rc.item_id
       JOIN documents d ON d.id = i.document_id
       WHERE ${filters.join(" AND ")}
     ), grouped AS (
       SELECT *, count(*) OVER()::int AS total_count
       FROM matched WHERE group_rank = 1
     )
     SELECT * FROM grouped
     ORDER BY meeting_date DESC, file_number DESC, id DESC
     LIMIT $${params.length}`,
    params,
  );

  const results = rows.map((row) => {
    const facts = extractItemFacts(row.title, row.content);
    return {
      id: String(row.id),
      meetingDate: String(row.meeting_date),
      year: row.year,
      fileNumber: row.file_number,
      title: row.title,
      recordedPosition: row.position as VotePosition,
      recordedName: row.recorded_name,
      action: row.action,
      actionType: row.action_type,
      isFinal: row.is_final,
      extractionConfidence: Number(row.confidence),
      extracted: facts,
      transcriptUrl: documentFileUrl(String(row.document_id), String(row.meeting_date), "minutes", row.file_number),
      markdownUrl: documentMarkdownExcerptUrl(String(row.document_id), String(row.meeting_date), "minutes", row.start_page, row.end_page),
      officialUrl: row.official_url,
    };
  });

  const counts = { aye: 0, no: 0, absent: 0, excused: 0 };
  for (const result of results) counts[result.recordedPosition] += 1;
  return {
    voter: { slug: identity.slug, displayName: identity.display_name },
    filters: publicFilters(options),
    semantics: {
      unit: options.groupBy === "file" ? "one most-recent matching action per legislative file" : "one recorded roll-call position",
      warning: "A recorded position applies to the returned action and is not automatically a stance on the underlying project or policy.",
    },
    total: rows[0]?.total_count ?? 0,
    returned: results.length,
    counts,
    results,
  };
}

export async function aggregateHousing(options: Omit<AggregateOptions, "housingOnly">) {
  const aggregate = await aggregateRecordedVotes({ ...options, housingOnly: true, groupBy: "file" });
  const results = aggregate.results.map((result) => {
    const unitMentions = [...new Set(result.extracted.housingUnits)].sort((a, b) => a - b);
    return { ...result, unitMentions, selectedUnitCount: unitMentions.at(-1) ?? null };
  });
  const known = results.filter((result) => result.selectedUnitCount !== null);
  return {
    ...aggregate,
    aggregation: {
      rule: "For each legislative file, select the largest explicit housing-unit count parsed from the most recent matching action, then sum those selected counts.",
      caution: "This is a reproducible text extraction, not a claim that units were approved, blocked, built, or prevented. Review each action and source.",
      filesWithKnownUnitCount: known.length,
      filesWithoutKnownUnitCount: results.length - known.length,
      selectedUnitCountTotal: known.reduce((sum, result) => sum + (result.selectedUnitCount ?? 0), 0),
      addresses: [...new Set(results.flatMap((result) => result.extracted.addresses))].sort(),
    },
    results,
  };
}

function emptyAggregate(options: AggregateOptions, error: string) {
  return {
    error,
    voter: null,
    filters: publicFilters(options),
    semantics: {
      unit: options.groupBy === "file" ? "one most-recent matching action per legislative file" : "one recorded roll-call position",
      warning: "A recorded position applies to the returned action.",
    },
    total: 0,
    returned: 0,
    counts: { aye: 0, no: 0, absent: 0, excused: 0 },
    results: [] as Array<never>,
  };
}

function publicFilters(options: AggregateOptions) {
  return {
    position: options.position,
    fromYear: options.fromYear,
    toYear: options.toYear,
    finalOnly: options.finalOnly,
    groupBy: options.groupBy,
    housingOnly: Boolean(options.housingOnly),
  };
}
