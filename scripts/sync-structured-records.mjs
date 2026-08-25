import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = neon(process.env.DATABASE_URL);
const args = parseArguments(process.argv.slice(2));
const fromYear = numberArg("from-year", 1996);
const toYear = numberArg("to-year", new Date().getUTCFullYear());
const matterLimit = numberArg("legistar-limit", 250);
const skipVersions = args.has("skip-versions");
const skipLegistar = args.has("skip-legistar");
const parserName = "sfbos-structured-records";
const parserVersion = "2.1.0";
const configHash = sha256(JSON.stringify({ fromYear, toYear, parserVersion }));
const supervisorRosterUrl = "https://sfbos.org/current-supervisors";
const officeAddress = "1 Dr. Carlton B. Goodlett Place, City Hall";
const fallbackContacts = new Map([
  ["connie-chan", contact("1", "(415) 554-7410", "ChanStaff@sfgov.org", "/supervisor-chan-district-1")],
  ["stephen-sherrill", contact("2", "(415) 554-7752", "SherrillStaff@sfgov.org", "/supervisor-sherrill-district-2")],
  ["danny-sauter", contact("3", "(415) 554-7450", "SauterStaff@sfgov.org", "/supervisor-sauter-district-3")],
  ["alan-wong", contact("4", "(415) 554-7960", "WongStaff@sfgov.org", "/supervisor-wong-district-4")],
  ["bilal-mahmood", contact("5", "(415) 554-7630", "MahmoodStaff@sfgov.org", "/supervisor-mahmood-district-5")],
  ["matt-dorsey", contact("6", "(415) 554-7970", "DorseyStaff@sfgov.org", "/supervisor-dorsey-district-6")],
  ["myrna-melgar", contact("7", "(415) 554-6516", "MelgarStaff@sfgov.org", "/supervisor-melgar-district-7")],
  ["rafael-mandelman", contact("8", "(415) 554-6968", "MandelmanStaff@sfgov.org", "/supervisor-mandelman-district-8")],
  ["jackie-fielder", contact("9", "(415) 554-5144", "Jackie.Fielder@sfgov.org", "/supervisor-fielder-district-9")],
  ["shamann-walton", contact("10", "(415) 554-7670", "Shamann.Walton@sfgov.org", "/supervisor-walton-district-10")],
  ["chyanne-chen", contact("11", "(415) 554-6975", "ChenStaff@sfgov.org", "/supervisor-chen-district-11")],
]);
const fetchedContacts = await fetchCurrentSupervisorContacts();
const currentContacts = fetchedContacts.size ? fetchedContacts : fallbackContacts;
const currentDistricts = new Map([...currentContacts].map(([slug, value]) => [slug, value.district]));
const knownDistricts = new Map([
  ["aaron-peskin", "3"], ["ahsha-safai", "11"], ["alan-wong", "4"],
  ["beya-alcaraz", "4"], ["bilal-mahmood", "5"], ["carmen-chu", "4"], ["catherine-stefani", "2"],
  ["christina-olague", "5"], ["chyanne-chen", "11"], ["connie-chan", "1"],
  ["danny-sauter", "3"], ["david-campos", "9"], ["david-chiu", "3"],
  ["dean-preston", "5"], ["gordon-mar", "4"], ["hillary-ronen", "9"],
  ["jackie-fielder", "9"], ["jane-kim", "6"], ["jeff-sheehy", "8"],
  ["joel-engardio", "4"], ["john-avalos", "11"], ["julie-christensen", "3"],
  ["katy-tang", "4"], ["london-breed", "5"], ["malia-cohen", "10"],
  ["mark-farrell", "2"], ["matt-dorsey", "6"], ["matt-haney", "6"],
  ["myrna-melgar", "7"], ["norman-yee", "7"], ["rafael-mandelman", "8"],
  ["sandra-fewer", "1"], ["scott-wiener", "8"], ["sean-elsbernd", "7"],
  ["shamann-walton", "10"], ["stephen-sherrill", "2"], ["vallie-brown", "5"],
]);
const supervisors = [
  ["beya-alcaraz", "Beya Alcaraz", "Alcaraz"],
  ["john-avalos", "John Avalos", "Avalos"], ["london-breed", "London Breed", "Breed"],
  ["vallie-brown", "Vallie Brown", "Brown"], ["david-campos", "David Campos", "Campos"],
  ["connie-chan", "Connie Chan", "Chan"], ["chyanne-chen", "Chyanne Chen", "Chen"],
  ["julie-christensen", "Julie Christensen", "Christensen"], ["david-chiu", "David Chiu", "Chiu"],
  ["carmen-chu", "Carmen Chu", "Chu"], ["malia-cohen", "Malia Cohen", "Cohen"],
  ["matt-dorsey", "Matt Dorsey", "Dorsey"], ["sean-elsbernd", "Sean Elsbernd", "Elsbernd"],
  ["joel-engardio", "Joel Engardio", "Engardio"], ["mark-farrell", "Mark Farrell", "Farrell"],
  ["sandra-fewer", "Sandra Lee Fewer", "Fewer"], ["jackie-fielder", "Jackie Fielder", "Fielder"],
  ["matt-haney", "Matt Haney", "Haney"], ["jane-kim", "Jane Kim", "Kim"],
  ["bilal-mahmood", "Bilal Mahmood", "Mahmood"], ["rafael-mandelman", "Rafael Mandelman", "Mandelman"],
  ["gordon-mar", "Gordon Mar", "Mar"], ["myrna-melgar", "Myrna Melgar", "Melgar"],
  ["christina-olague", "Christina Olague", "Olague"], ["aaron-peskin", "Aaron Peskin", "Peskin"],
  ["dean-preston", "Dean Preston", "Preston"], ["hillary-ronen", "Hillary Ronen", "Ronen"],
  ["ahsha-safai", "Ahsha Safai", "Safai"], ["danny-sauter", "Danny Sauter", "Sauter"],
  ["jeff-sheehy", "Jeff Sheehy", "Sheehy"], ["catherine-stefani", "Catherine Stefani", "Stefani"],
  ["katy-tang", "Katy Tang", "Tang"], ["shamann-walton", "Shamann Walton", "Walton"],
  ["scott-wiener", "Scott Wiener", "Wiener"], ["norman-yee", "Norman Yee", "Yee"],
  ["stephen-sherrill", "Stephen Sherrill", "Sherrill"], ["alan-wong", "Alan Wong", "Wong"],
].map(([slug, name, family]) => ({
  slug, name, family,
  district: currentDistricts.get(slug) ?? knownDistricts.get(slug) ?? null,
  active: currentDistricts.has(slug),
  contact: currentContacts.get(slug) ?? null,
  aliases: slug === "aaron-peskin" ? ["Peskn"] : [],
}));

const [ingestionRun] = await sql.query(
  `INSERT INTO ingestion_runs (source, status, parser_name, parser_version)
   VALUES ('legistar+official-pdfs', 'running', $1, $2)
   RETURNING id::text`,
  [parserName, parserVersion],
);
const [parserRun] = await sql.query(
  `INSERT INTO parser_runs (parser_name, parser_version, config_hash, status)
   VALUES ($1, $2, $3, 'running') RETURNING id::text`,
  [parserName, parserVersion, configHash],
);

const statistics = {
  documents: 0,
  files: 0,
  matters: 0,
  supervisors: 0,
  positions: 0,
  evidenceSpans: 0,
  documentVersions: 0,
};

try {
  await reconcileDocumentIdentifiers();
  await reconcileFiles();
  if (!skipLegistar) await ingestLegistarMatters(matterLimit);
  await reconcileSupervisors();
  await reconcilePositions();
  await buildEvidenceSpans(parserRun.id);
  if (!skipVersions) await captureDocumentVersions(parserRun.id);
  await appendInitialChanges();

  const [counts] = await sql.query(
    `SELECT
       (SELECT count(*)::int FROM documents WHERE year BETWEEN $1 AND $2) AS documents,
       (SELECT count(*)::int FROM legislative_files) AS files,
       (SELECT count(*)::int FROM legistar_matters) AS matters,
       (SELECT count(*)::int FROM supervisors) AS supervisors,
       (SELECT count(*)::int FROM roll_call_positions) AS positions,
       (SELECT count(*)::int FROM evidence_spans) AS evidence_spans,
       (SELECT count(*)::int FROM document_versions) AS document_versions`,
    [fromYear, toYear],
  );
  Object.assign(statistics, {
    documents: counts.documents,
    files: counts.files,
    matters: counts.matters,
    supervisors: counts.supervisors,
    positions: counts.positions,
    evidenceSpans: counts.evidence_spans,
    documentVersions: counts.document_versions,
  });

  await sql.query(
    `UPDATE parser_runs SET status = 'complete', finished_at = now(), statistics = $2::jsonb WHERE id = $1`,
    [parserRun.id, JSON.stringify(statistics)],
  );
  await sql.query(
    `UPDATE ingestion_runs SET status = 'complete', finished_at = now(), statistics = $2::jsonb WHERE id = $1`,
    [ingestionRun.id, JSON.stringify(statistics)],
  );
  console.log(JSON.stringify({ status: "complete", parserVersion, ...statistics }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await sql.query(
    `UPDATE parser_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
    [parserRun.id, message.slice(0, 10000)],
  );
  await sql.query(
    `UPDATE ingestion_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
    [ingestionRun.id, message.slice(0, 10000)],
  );
  throw error;
}

async function reconcileDocumentIdentifiers() {
  await sql.query(
    `INSERT INTO document_identifiers (document_id, scheme, value, confidence, source)
     SELECT id, 'legistar-event-id', event_id::text, 1, 'official-calendar-feed'
     FROM documents
     WHERE event_id IS NOT NULL AND year BETWEEN $1 AND $2
     ON CONFLICT (scheme, value, document_id) DO NOTHING`,
    [fromYear, toYear],
  );
  await sql.query(
    `INSERT INTO document_identifiers (document_id, scheme, value, confidence, source)
     SELECT id, 'legistar-event-guid', event_guid::text, 1, 'official-calendar-feed'
     FROM documents
     WHERE event_guid IS NOT NULL AND year BETWEEN $1 AND $2
     ON CONFLICT (scheme, value, document_id) DO NOTHING`,
    [fromYear, toYear],
  );
  await sql.query(
    `INSERT INTO document_identifiers (document_id, scheme, value, confidence, source)
     SELECT id, 'official-url', official_url, 1, 'official-calendar-feed'
     FROM documents WHERE year BETWEEN $1 AND $2
     ON CONFLICT (scheme, value, document_id) DO NOTHING`,
    [fromYear, toYear],
  );
  await sql.query(
    `INSERT INTO legistar_events (
       event_id, event_guid, event_date, body_name, agenda_url, minutes_url, raw
     )
     SELECT
       event_id,
       (array_agg(event_guid) FILTER (WHERE event_guid IS NOT NULL))[1],
       min(meeting_date),
       'Board of Supervisors',
       max(official_url) FILTER (WHERE kind = 'agenda'),
       max(official_url) FILTER (WHERE kind = 'minutes'),
       jsonb_build_object('reconciliationSource', 'official-calendar-feed')
     FROM documents
     WHERE event_id IS NOT NULL AND year BETWEEN $1 AND $2
     GROUP BY event_id
     ON CONFLICT (event_id) DO NOTHING`,
    [fromYear, toYear],
  );
}

async function reconcileFiles() {
  await sql.query(
    `INSERT INTO legislative_files (
       file_number, canonical_title, first_seen_date, last_seen_date, metadata
     )
     SELECT
       i.file_number,
       (array_agg(i.title ORDER BY d.meeting_date DESC, i.ordinal DESC))[1],
       min(d.meeting_date),
       max(d.meeting_date),
       jsonb_build_object('parsedItemCount', count(*))
     FROM legislative_items i
     JOIN documents d ON d.id = i.document_id
     GROUP BY i.file_number
     ON CONFLICT (file_number) DO UPDATE SET
       canonical_title = excluded.canonical_title,
       first_seen_date = least(legislative_files.first_seen_date, excluded.first_seen_date),
       last_seen_date = greatest(legislative_files.last_seen_date, excluded.last_seen_date),
       metadata = excluded.metadata,
       updated_at = now()
     WHERE legislative_files.canonical_title IS DISTINCT FROM excluded.canonical_title
        OR legislative_files.first_seen_date IS DISTINCT FROM least(legislative_files.first_seen_date, excluded.first_seen_date)
        OR legislative_files.last_seen_date IS DISTINCT FROM greatest(legislative_files.last_seen_date, excluded.last_seen_date)
        OR legislative_files.metadata IS DISTINCT FROM excluded.metadata`,
    [],
  );
  await sql.query(
    `UPDATE legislative_items i SET legislative_file_id = f.id
     FROM legislative_files f
     WHERE i.file_number = f.file_number AND i.legislative_file_id IS DISTINCT FROM f.id`,
    [],
  );
}

async function ingestLegistarMatters(limit) {
  const files = await sql.query(
    `SELECT f.file_number
     FROM legislative_files f
     LEFT JOIN legistar_matters m ON m.file_number = f.file_number
     WHERE m.matter_id IS NULL
       AND f.last_seen_date < DATE '2019-01-01'
       AND (f.last_legistar_checked_at IS NULL OR f.last_legistar_checked_at < now() - interval '30 days')
     ORDER BY f.last_legistar_checked_at NULLS FIRST, f.last_seen_date DESC NULLS LAST, f.file_number DESC
     LIMIT $1`,
    [limit],
  );
  const results = await concurrentMap(files, 8, async ({ file_number }) => {
    const filter = encodeURIComponent(`MatterFile eq '${file_number}'`);
    const response = await fetch(`https://webapi.legistar.com/v1/sfgov/Matters?%24filter=${filter}`, {
      headers: { Accept: "application/json", "User-Agent": "sfbos.info structured-records/2.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { fileNumber: file_number, matters: [] };
    const body = await response.json();
    return { fileNumber: file_number, matters: Array.isArray(body) ? body : [] };
  });

  for (const result of results) {
    for (const matter of result.matters) await sql.query(
      `INSERT INTO legistar_matters (
         matter_id, matter_guid, file_number, name, title, matter_type, status,
         introduced_date, final_action_date, raw, source_updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       ON CONFLICT (matter_id) DO UPDATE SET
         matter_guid = excluded.matter_guid,
         file_number = excluded.file_number,
         name = excluded.name,
         title = excluded.title,
         matter_type = excluded.matter_type,
         status = excluded.status,
         introduced_date = excluded.introduced_date,
         final_action_date = excluded.final_action_date,
         raw = excluded.raw,
         source_updated_at = excluded.source_updated_at,
         ingested_at = now()`,
      [
        matter.MatterId, matter.MatterGuid, matter.MatterFile, matter.MatterName,
        matter.MatterTitle, matter.MatterTypeName, matter.MatterStatusName,
        dateOnly(matter.MatterIntroDate), dateOnly(matter.MatterPassedDate),
        JSON.stringify(matter), matter.MatterLastModifiedUtc,
      ],
    );
    await sql.query(
      `UPDATE legislative_files SET last_legistar_checked_at = now()
       WHERE file_number = $1`,
      [result.fileNumber],
    );
  }
  await sql.query(
    `UPDATE legislative_files f SET legistar_matter_id = m.matter_id, updated_at = now()
     FROM legistar_matters m
     WHERE m.file_number = f.file_number
       AND f.legistar_matter_id IS DISTINCT FROM m.matter_id`,
    [],
  );
}

async function reconcileSupervisors() {
  for (const supervisor of supervisors) {
    let [row] = await sql.query(
      `INSERT INTO supervisors (slug, display_name, family_name, district, active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (slug) DO UPDATE SET
         display_name = excluded.display_name,
         family_name = excluded.family_name,
         district = excluded.district,
         active = excluded.active,
         metadata = supervisors.metadata || excluded.metadata,
         updated_at = now()
       WHERE supervisors.display_name IS DISTINCT FROM excluded.display_name
          OR supervisors.family_name IS DISTINCT FROM excluded.family_name
          OR supervisors.district IS DISTINCT FROM excluded.district
          OR supervisors.active IS DISTINCT FROM excluded.active
          OR supervisors.metadata IS DISTINCT FROM supervisors.metadata || excluded.metadata
       RETURNING id::text`,
      [supervisor.slug, supervisor.name, supervisor.family, supervisor.district, supervisor.active, JSON.stringify({
        source: "curated-name-reconciliation",
        ...(supervisor.contact ? { contact: supervisor.contact } : {}),
      })],
    );
    if (!row) {
      [row] = await sql.query("SELECT id::text FROM supervisors WHERE slug = $1", [supervisor.slug]);
    }
    for (const alias of [
      supervisor.family,
      supervisor.name,
      `Supervisor ${supervisor.family}`,
      `Supervisor ${supervisor.name}`,
      ...(supervisor.aliases ?? []),
    ]) {
      await sql.query(
        `INSERT INTO supervisor_aliases (
           supervisor_id, alias, normalized_alias, source, confidence
         ) VALUES ($1,$2,$3,'curated-name-reconciliation',$4)
         ON CONFLICT (normalized_alias) DO UPDATE SET
           supervisor_id = excluded.supervisor_id,
           alias = excluded.alias,
           source = excluded.source,
           confidence = excluded.confidence
         WHERE supervisor_aliases.supervisor_id IS DISTINCT FROM excluded.supervisor_id
            OR supervisor_aliases.alias IS DISTINCT FROM excluded.alias
            OR supervisor_aliases.source IS DISTINCT FROM excluded.source
            OR supervisor_aliases.confidence IS DISTINCT FROM excluded.confidence`,
        [row.id, alias, normalizeName(alias), alias === supervisor.family ? 1 : 0.99],
      );
    }
  }
}

function contact(district, phone, email, profilePath) {
  return {
    district,
    phone,
    email,
    address: officeAddress,
    officialUrl: new URL(profilePath, supervisorRosterUrl).href,
    sourceUrl: supervisorRosterUrl,
  };
}

async function fetchCurrentSupervisorContacts() {
  try {
    const response = await fetch(supervisorRosterUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const contacts = new Map();
    for (const match of html.matchAll(/<td[^>]*class="bos_info"[^>]*>([\s\S]*?)<\/td>/gi)) {
      const block = match[1];
      const profile = block.match(/href="(\/supervisor-[^"]+-district-\d+)"[^>]*>([^<]+)<\/a>/i);
      const district = block.match(/District\s+(\d+)/i)?.[1];
      const phone = block.match(/(\(415\)\s*554-\d{4})\s*-\s*Voice/i)?.[1];
      const email = block.match(/(?:mailto:)?([a-z0-9._%+-]+@sfgov\.org)/i)?.[1];
      if (!profile || !district || !phone || !email) continue;
      const displayName = decodeHtml(profile[2]).trim();
      contacts.set(slugify(displayName), contact(district, phone, email, profile[1]));
    }
    if (contacts.size < 11) throw new Error(`parsed only ${contacts.size} contacts`);
    return contacts;
  } catch (error) {
    console.warn(`Could not refresh ${supervisorRosterUrl}; using curated contact fallback.`, error);
    return new Map();
  }
}

function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#039;/g, "'").replace(/&quot;/g, '"');
}

async function reconcilePositions() {
  await sql.query(
    `INSERT INTO roll_call_positions (
       roll_call_id, supervisor_id, recorded_name, position, confidence, source
     )
     SELECT
       recorded.roll_call_id,
       a.supervisor_id,
       recorded.recorded_name,
       recorded.position,
       CASE WHEN a.supervisor_id IS NULL THEN 0.5 ELSE a.confidence END,
       'official-minutes-parser'
     FROM (
       SELECT rc.id AS roll_call_id, unnest(rc.ayes) AS recorded_name, 'aye' AS position FROM roll_calls rc
       UNION ALL SELECT rc.id, unnest(rc.noes), 'no' FROM roll_calls rc
       UNION ALL SELECT rc.id, unnest(rc.absent), 'absent' FROM roll_calls rc
       UNION ALL SELECT rc.id, unnest(rc.excused), 'excused' FROM roll_calls rc
     ) recorded
     LEFT JOIN supervisor_aliases a
       ON a.normalized_alias = lower(regexp_replace(trim(recorded.recorded_name), '[^a-zA-Z0-9]+', '', 'g'))
     ON CONFLICT (roll_call_id, recorded_name, position) DO NOTHING`,
    [],
  );
  await sql.query(
    `UPDATE roll_call_positions rcp SET
       supervisor_id = a.supervisor_id,
       confidence = a.confidence,
       source = 'official-minutes-parser'
     FROM supervisor_aliases a
     WHERE rcp.supervisor_id IS NULL
       AND a.normalized_alias = lower(regexp_replace(trim(rcp.recorded_name), '[^a-zA-Z0-9]+', '', 'g'))`,
    [],
  );
  await sql.query(
    `UPDATE roll_call_positions rcp SET
       supervisor_id = matched.supervisor_id,
       confidence = 0.98,
       source = 'official-minutes-parser+service-dates'
     FROM (
       SELECT rcp_inner.id, candidate.id AS supervisor_id
       FROM roll_call_positions rcp_inner
       JOIN roll_calls rc ON rc.id = rcp_inner.roll_call_id
       JOIN legislative_items i ON i.id = rc.item_id
       JOIN documents d ON d.id = i.document_id
       CROSS JOIN LATERAL (
         SELECT s.id
         FROM supervisors s
         WHERE lower(regexp_replace(trim(rcp_inner.recorded_name), '[^a-zA-Z0-9]+', '', 'g')) =
               lower(regexp_replace(trim(s.family_name), '[^a-zA-Z0-9]+', '', 'g'))
           AND s.term_start IS NOT NULL
           AND s.term_end IS NOT NULL
           AND d.meeting_date BETWEEN s.term_start AND s.term_end
         ORDER BY s.term_start DESC
         LIMIT 1
       ) candidate
     ) matched
     WHERE rcp.id = matched.id
       AND rcp.supervisor_id IS DISTINCT FROM matched.supervisor_id`,
    [],
  );
}

async function buildEvidenceSpans(parserRunId) {
  await sql.query(
    `DELETE FROM evidence_spans es
     WHERE es.entity_type = 'legislative-item'
       AND NOT EXISTS (SELECT 1 FROM legislative_items i WHERE i.id::text = es.entity_id)`,
    [],
  );
  await sql.query(
    `INSERT INTO evidence_spans (
       document_id, page_number, entity_type, entity_id, field_name, value_text,
       start_offset, end_offset, quote, confidence, parser_run_id
     )
     SELECT
       i.document_id, i.start_page, 'legislative-item', i.id::text, 'file-number',
       i.file_number, strpos(p.content, i.file_number) - 1,
       strpos(p.content, i.file_number) - 1 + length(i.file_number),
       left(i.file_number || ' ' || i.title, 1000), 0.96, $1
     FROM legislative_items i
     JOIN documents d ON d.id = i.document_id
     JOIN pages p ON p.document_id = i.document_id AND p.page_number = i.start_page
     WHERE d.year BETWEEN $2 AND $3
     ON CONFLICT (document_id, page_number, entity_type, entity_id, field_name, value_text)
     DO NOTHING`,
    [parserRunId, fromYear, toYear],
  );
}

async function captureDocumentVersions(parserRunId) {
  const documents = await sql.query(
    `SELECT id::text FROM documents WHERE year BETWEEN $1 AND $2 ORDER BY id`,
    [fromYear, toYear],
  );
  const batchSize = 25;
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    const ids = documents.slice(offset, offset + batchSize).map((document) => document.id);
    const pages = await sql.query(
      `SELECT document_id::text, page_number, content
       FROM pages WHERE document_id = ANY($1::bigint[])
       ORDER BY document_id, page_number`,
      [ids],
    );
    const byDocument = new Map(ids.map((id) => [id, []]));
    for (const page of pages) byDocument.get(page.document_id)?.push(page);

    for (const id of ids) {
      const documentPages = byDocument.get(id) ?? [];
      const contentSha = sha256(documentPages.map((page) => `${page.page_number}\n${page.content}`).join("\f"));
      let [version] = await sql.query(
        `SELECT id::text, version_number FROM document_versions
         WHERE document_id = $1 AND content_sha256 = $2`,
        [id, contentSha],
      );
      if (!version) {
        [version] = await sql.query(
          `INSERT INTO document_versions (
             document_id, version_number, content_sha256, page_count, parser_run_id
           )
           SELECT $1, coalesce(max(version_number), 0) + 1, $2, $3, $4
           FROM document_versions WHERE document_id = $1
           RETURNING id::text, version_number`,
          [id, contentSha, documentPages.length, parserRunId],
        );
        await sql.query(
          `INSERT INTO change_log (entity_type, entity_key, change_type, version, payload)
           VALUES ('document', $1, $2, $3, $4::jsonb)`,
          [id, Number(version.version_number) === 1 ? "create" : "update", String(version.version_number), JSON.stringify({ contentSha256: contentSha, pageCount: documentPages.length })],
        );
      }
    }
    console.log(`Captured versions for ${Math.min(offset + batchSize, documents.length)}/${documents.length} documents.`);
  }
}

async function appendInitialChanges() {
  await sql.query(
    `INSERT INTO change_log (entity_type, entity_key, change_type, version, payload)
     SELECT 'supervisor', s.slug, 'create', '1',
       jsonb_build_object('displayName', s.display_name, 'familyName', s.family_name)
     FROM supervisors s
     WHERE NOT EXISTS (
       SELECT 1 FROM change_log c WHERE c.entity_type = 'supervisor' AND c.entity_key = s.slug
     )`,
    [],
  );
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result.set(key, true);
    else {
      result.set(key, next);
      index += 1;
    }
  }
  return result;
}

function numberArg(key, fallback) {
  const value = Number(args.get(key) ?? fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${key} must be a non-negative integer`);
  return value;
}

async function concurrentMap(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        output[index] = await mapper(values[index], index);
      } catch (error) {
        console.warn(`Legistar request failed: ${error instanceof Error ? error.message : error}`);
        output[index] = { fileNumber: values[index]?.file_number ?? "", matters: [] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}
