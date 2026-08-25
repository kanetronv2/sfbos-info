import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const sourceUrl = "https://sfbos.org/former-supervisors";
const firstCatalogDate = "1996-01-01";
const districtBySlug = new Map(Object.entries({
  "michela-alioto-pier": "2",
  "tom-ammiano": "9",
  "chris-daly": "6",
  "bevan-dufty": "8",
  "matt-gonzalez": "5",
  "tony-hall": "7",
  "ed-jew": "4",
  "mark-leno": "8",
  "fiona-ma": "4",
  "eric-mar": "1",
  "sophie-maxwell": "10",
  "jake-mcgoldrick": "1",
  "ross-mirkarimi": "5",
  "gavin-newsom": "2",
  "gerardo-sandoval": "11",
  "leland-yee": "4",
}));
const canonicalNames = new Map([
  ["Christine Olague", "Christina Olague"],
  ["J eff Sheehy", "Jeff Sheehy"],
]);

const response = await fetch(sourceUrl, {
  headers: { "User-Agent": "sfbos.info supervisor reconciliation/1.0" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Official former-supervisors directory returned ${response.status}`);
const records = parseFormerSupervisors(await response.text());
let inserted = 0;
let updated = 0;

for (const record of records) {
  const [existing] = await sql.query("SELECT id::text FROM supervisors WHERE slug = $1", [record.slug]);
  const [supervisor] = await sql.query(
    `INSERT INTO supervisors (
       slug, display_name, family_name, district, term_start, term_end, active, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,false,$7::jsonb)
     ON CONFLICT (slug) DO UPDATE SET
       term_start = coalesce(supervisors.term_start, excluded.term_start),
       term_end = coalesce(supervisors.term_end, excluded.term_end),
       district = coalesce(supervisors.district, excluded.district),
       metadata = supervisors.metadata || excluded.metadata,
       updated_at = now()
     RETURNING id::text`,
    [
      record.slug,
      record.name,
      record.familyName,
      record.district,
      record.termStart,
      record.termEnd,
      JSON.stringify({
        source: "official-former-supervisors-directory",
        officialUrl: record.officialUrl,
        sourceUrl,
      }),
    ],
  );
  if (existing) updated += 1;
  else inserted += 1;

  for (const alias of [record.name, `Supervisor ${record.name}`, record.familyName, `Supervisor ${record.familyName}`]) {
    await sql.query(
      `INSERT INTO supervisor_aliases (supervisor_id, alias, normalized_alias, source, confidence)
       VALUES ($1,$2,$3,'official-former-supervisors-directory',$4)
       ON CONFLICT (normalized_alias) DO NOTHING`,
      [supervisor.id, alias, normalizeName(alias), alias === record.familyName ? 1 : 0.99],
    );
  }
}

await sql.query(
  `UPDATE roll_call_positions rcp SET
     supervisor_id = a.supervisor_id,
     confidence = a.confidence,
     source = 'official-minutes-parser'
   FROM supervisor_aliases a
   WHERE rcp.supervisor_id IS NULL
     AND a.normalized_alias = lower(regexp_replace(trim(rcp.recorded_name), '[^a-zA-Z0-9]+', '', 'g'))`,
);

console.log(JSON.stringify({ sourceUrl, records: records.length, inserted, updated }, null, 2));

function parseFormerSupervisors(html) {
  const records = [];
  for (const match of html.matchAll(/<table[^>]*(?:width="760"|width:\s*760px)[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = match[1];
    const nameBlock = table.match(/<div[^>]*text-align:\s*center[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if (!nameBlock) continue;
    const parsedName = cleanText(nameBlock);
    const name = canonicalNames.get(parsedName) ?? parsedName;
    const dates = [...table.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map((date) => isoDate(date[1])).sort();
    if (!name || !dates.length || dates.at(-1) < firstCatalogDate) continue;
    const slug = slugify(name);
    const profilePath = nameBlock.match(/href="([^"]+)"/i)?.[1] ?? sourceUrl;
    const servedAfterAtLargeEra = dates.at(-1) > "2001-01-08";
    records.push({
      slug,
      name,
      familyName: familyName(name),
      district: districtBySlug.get(slug) ?? (servedAfterAtLargeEra ? null : "At-large"),
      termStart: dates[0],
      termEnd: dates.at(-1),
      officialUrl: new URL(profilePath, sourceUrl).href,
    });
  }
  return records;
}

function cleanText(value) {
  return value.replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&#039;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function isoDate(value) {
  const [month, day, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function familyName(name) {
  return name.trim().split(/\s+/).at(-1);
}

function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeName(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
