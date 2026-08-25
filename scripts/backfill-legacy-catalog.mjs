import { neon } from "@neondatabase/serverless";

const archiveOrigin = "https://sfbos.archive.sf.gov";
const startYear = numberArgument("from-year", 1996);
const endYear = numberArgument("to-year", 2011);
const dryRun = process.argv.includes("--dry-run");

if (!dryRun && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (startYear < 1900 || endYear > 2011 || startYear > endYear) {
  throw new Error("Legacy catalog years must be between 1900 and 2011");
}

const records = [];
for (let year = startYear; year <= endYear; year += 1) {
  const catalogUrl = `${archiveOrigin}/ftp/meetingarchive/full_board/meeting.aspx-page%3D2315%26subpage%3D${year}.html`;
  const response = await fetch(catalogUrl);
  if (!response.ok) throw new Error(`Unable to load the official ${year} catalog: ${response.status}`);
  const html = await response.text();
  const agendaStart = html.search(/<span>\s*Agendas\s*<\/span>/i);
  const minutesStart = html.search(/<span>\s*Minutes\s*<\/span>/i);
  if (agendaStart < 0 || minutesStart < 0) {
    console.warn(`${year}: the official catalog did not expose both agenda and minutes sections.`);
    continue;
  }
  records.push(
    ...extractRecords(html.slice(agendaStart, minutesStart), "agenda", catalogUrl, year),
    ...extractRecords(html.slice(minutesStart), "minutes", catalogUrl, year),
  );
}

const uniqueRecords = [...new Map(records.map((record) => [record.official_url, record])).values()]
  .sort((left, right) => left.meeting_date.localeCompare(right.meeting_date) || left.kind.localeCompare(right.kind));
const byYear = new Map();
for (const record of uniqueRecords) {
  const counts = byYear.get(record.year) ?? { agenda: 0, minutes: 0, pdf: 0, html: 0 };
  counts[record.kind] += 1;
  counts[record.source_format] += 1;
  byYear.set(record.year, counts);
}
for (const [year, counts] of byYear) {
  console.log(`${year}: ${counts.agenda} agendas, ${counts.minutes} minutes (${counts.pdf} PDF, ${counts.html} HTML)`);
}
console.log(`Resolved ${uniqueRecords.length} official pre-2012 catalog records.`);
if (dryRun) process.exit(0);

const sql = neon(process.env.DATABASE_URL);
const [run] = await sql.query(
  `INSERT INTO ingestion_runs (source, status, parser_name, parser_version)
   VALUES ('official-legacy-full-board-catalog', 'running', 'legacy-catalog', '1.0.0')
   RETURNING id::text`,
);

try {
  let created = 0;
  for (let offset = 0; offset < uniqueRecords.length; offset += 500) {
    const batch = uniqueRecords.slice(offset, offset + 500);
    const result = await sql.query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS record(
           meeting_date date, year integer, kind text, title text,
           official_url text, source_format text
         )
       ), upserted AS (
         INSERT INTO documents (
           meeting_date, year, kind, title, official_url, source_format,
           local_path, page_count, cataloged_at, indexed_at
         )
         SELECT meeting_date, year, kind, title, official_url, source_format,
                NULL, 0, now(), now()
         FROM incoming
         ON CONFLICT (official_url) DO UPDATE SET
           meeting_date = excluded.meeting_date,
           year = excluded.year,
           kind = excluded.kind,
           title = excluded.title,
           source_format = excluded.source_format,
           cataloged_at = now()
         RETURNING id::text, official_url, (xmax = 0) AS created
       ), changes AS (
         INSERT INTO change_log (entity_type, entity_key, change_type, version, payload)
         SELECT 'document', id, 'create', 'catalog-1',
                jsonb_build_object('officialUrl', official_url, 'catalogOnly', true)
         FROM upserted WHERE created
         RETURNING 1
       )
       SELECT
         (SELECT count(*)::int FROM upserted WHERE created) AS created,
         (SELECT count(*)::int FROM upserted WHERE NOT created) AS updated`,
      [JSON.stringify(batch)],
    );
    created += Number(result[0]?.created ?? 0);
  }
  await sql.query(
    `UPDATE ingestion_runs SET status = 'complete', finished_at = now(), statistics = $2::jsonb WHERE id = $1`,
    [run.id, JSON.stringify({ resolved: uniqueRecords.length, created, updated: uniqueRecords.length - created, fromYear: startYear, toYear: endYear })],
  );
  console.log(`Catalog backfill complete. Created ${created}; refreshed ${uniqueRecords.length - created}.`);
} catch (error) {
  await sql.query(
    `UPDATE ingestion_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
    [run.id, error instanceof Error ? error.message : String(error)],
  );
  throw error;
}

function extractRecords(section, kind, catalogUrl, expectedYear) {
  const results = [];
  const linkPattern = /<li>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
  for (const match of section.matchAll(linkPattern)) {
    const href = decodeEntities(match[1]);
    if (!/\.pdf(?:$|\?)/i.test(href) && !/index\.aspx-page%?=?\d+\.html$/i.test(href) && !/index\.aspx-page=\d+\.html$/i.test(href)) continue;
    const label = decodeEntities(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const date = parseMeetingDate(label);
    if (!date || Number(date.meetingDate.slice(0, 4)) !== expectedYear) continue;
    const officialUrl = new URL(href, catalogUrl).toString();
    const sourceFormat = /\.pdf(?:$|\?)/i.test(href) ? "pdf" : "html";
    const qualifier = label.replace(date.matchedText, "").replace(/^\s*[-–:]\s*/, "").trim();
    const title = `Board of Supervisors ${kind === "agenda" ? "Agenda" : "Minutes"}: ${formatTitleDate(date.meetingDate)}${qualifier ? ` (${qualifier})` : ""}`;
    results.push({
      meeting_date: date.meetingDate,
      year: Number(date.meetingDate.slice(0, 4)),
      kind,
      title,
      official_url: officialUrl,
      source_format: sourceFormat,
    });
  }
  return results;
}

function parseMeetingDate(label) {
  const match = label.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!match) return null;
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(match[1].toLowerCase()) + 1;
  return {
    meetingDate: `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`,
    matchedText: match[0],
  };
}

function formatTitleDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—").replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function numberArgument(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return Number(inline.slice(prefix.length));
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}
