import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative } from "node:path";
import { neon } from "@neondatabase/serverless";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, "..");
const dataRoot = join(projectRoot, "data", "full-board-meetings");
const archiveOrigin = "https://sfbos.archive.sf.gov";
const legistarOrigin = "https://sfgov.legistar.com";

const argumentsMap = parseArguments(process.argv.slice(2));
const fromYear = Number(argumentsMap.get("from-year") ?? 1996);
const toYear = Number(argumentsMap.get("to-year") ?? 2026);
const documentLimit = Number(argumentsMap.get("limit") ?? Number.POSITIVE_INFINITY);
const force = argumentsMap.has("force");
const refresh = argumentsMap.has("refresh");
const dryRun = argumentsMap.has("dry-run");

if (!dryRun && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = dryRun ? null : neon(process.env.DATABASE_URL);

const eventMap = await fetchEventMap();
const documents = await collectDocuments(eventMap);
const selectedDocuments = documents
  .filter((document) => document.year >= fromYear && document.year <= toYear)
  .slice(0, documentLimit);

console.log(`Indexing ${selectedDocuments.length} documents from ${fromYear} through ${toYear}.`);

if (dryRun) {
  const agendas = selectedDocuments.filter((document) => document.kind === "agenda").length;
  const minutes = selectedDocuments.length - agendas;
  console.log(`Dry run complete. Resolved ${agendas} agendas and ${minutes} minutes; no database changes made.`);
  process.exit(0);
}

let indexed = 0;
let skipped = 0;

for (const document of selectedDocuments) {
  if (!force && !refresh && await isAlreadyIndexed(document.officialUrl)) {
    skipped += 1;
    continue;
  }

  const pages = await extractPages(document.absolutePath);
  const [existingDocument] = await sql.query(
    "SELECT id::text FROM documents WHERE official_url = $1 LIMIT 1",
    [document.officialUrl],
  );
  const oldPages = existingDocument
    ? await sql.query("SELECT page_number, content FROM pages WHERE document_id = $1 ORDER BY page_number", [existingDocument.id])
    : [];
  if (!force && refresh && oldPages.length && contentHash(oldPages) === contentHash(pages)) {
    skipped += 1;
    continue;
  }
  if (existingDocument && oldPages.length) {
    await archiveChangedPages(existingDocument.id, oldPages, pages);
  }
  const [record] = await sql.query(
    `
      INSERT INTO documents (
        meeting_date, year, kind, title, official_url, local_path,
        event_id, event_guid, page_count, indexed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (official_url) DO UPDATE SET
        meeting_date = EXCLUDED.meeting_date,
        year = EXCLUDED.year,
        kind = EXCLUDED.kind,
        title = EXCLUDED.title,
        local_path = EXCLUDED.local_path,
        event_id = EXCLUDED.event_id,
        event_guid = EXCLUDED.event_guid,
        page_count = EXCLUDED.page_count,
        public_comments_indexed_at = NULL,
        indexed_at = now()
      RETURNING id
    `,
    [
      document.meetingDate,
      document.year,
      document.kind,
      document.title,
      document.officialUrl,
      document.localPath,
      document.eventId,
      document.eventGuid,
      pages.length,
    ],
  );

  await sql.query("DELETE FROM pages WHERE document_id = $1", [record.id]);
  await sql.query("DELETE FROM legislative_items WHERE document_id = $1", [record.id]);
  await sql.query("DELETE FROM public_comments WHERE document_id = $1", [record.id]);

  for (let offset = 0; offset < pages.length; offset += 25) {
    const batch = pages.slice(offset, offset + 25);
    const values = [];
    const placeholders = batch.map((page, index) => {
      const base = index * 3;
      values.push(record.id, page.pageNumber, page.content);
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });
    await sql.query(
      `INSERT INTO pages (document_id, page_number, content) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
  await ensureVersion(String(record.id), pages);

  indexed += 1;
  console.log(`[${indexed + skipped}/${selectedDocuments.length}] ${document.localPath} (${pages.length} pages)`);
}

async function archiveChangedPages(documentId, oldPages, newPages) {
  const oldVersion = await ensureVersion(documentId, oldPages);
  if (contentHash(oldPages) === contentHash(newPages)) return;
  const nextByPage = new Map(newPages.map((page) => [page.pageNumber, page.content]));
  const changed = oldPages.filter((page) => nextByPage.get(page.page_number) !== page.content).map((page) => ({
    page_number: page.page_number,
    content_sha256: sha256(page.content),
    content: page.content,
  }));
  const oldNumbers = new Set(oldPages.map((page) => page.page_number));
  for (const page of newPages) {
    if (!oldNumbers.has(page.pageNumber)) changed.push({ page_number: page.pageNumber, content_sha256: "absent", content: "" });
  }
  if (!changed.length) return;
  await sql.query(
    `INSERT INTO document_version_pages (version_id, page_number, content_sha256, content)
     SELECT $1, x.page_number, x.content_sha256, x.content
     FROM jsonb_to_recordset($2::jsonb) AS x(page_number integer, content_sha256 text, content text)
     ON CONFLICT (version_id, page_number) DO NOTHING`,
    [oldVersion.id, JSON.stringify(changed)],
  );
}

async function ensureVersion(documentId, pages) {
  const hash = contentHash(pages);
  let [version] = await sql.query(
    "SELECT id::text, version_number FROM document_versions WHERE document_id = $1 AND content_sha256 = $2",
    [documentId, hash],
  );
  if (version) return version;
  [version] = await sql.query(
    `INSERT INTO document_versions (document_id, version_number, content_sha256, page_count)
     SELECT $1, coalesce(max(version_number), 0) + 1, $2, $3
     FROM document_versions WHERE document_id = $1
     RETURNING id::text, version_number`,
    [documentId, hash, pages.length],
  );
  await sql.query(
    `INSERT INTO change_log (entity_type, entity_key, change_type, version, payload)
     VALUES ('document', $1, $2, $3, $4::jsonb)`,
    [documentId, Number(version.version_number) === 1 ? "create" : "update", String(version.version_number), JSON.stringify({ contentSha256: hash, pageCount: pages.length })],
  );
  return version;
}

function contentHash(pages) {
  return sha256(pages.map((page) => `${page.pageNumber ?? page.page_number}\n${page.content}`).join("\f"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

console.log(`Done. Indexed ${indexed}; skipped ${skipped}.`);

async function isAlreadyIndexed(officialUrl) {
  const [row] = await sql.query(
    "SELECT page_count FROM documents WHERE official_url = $1 AND page_count > 0 LIMIT 1",
    [officialUrl],
  );
  return Boolean(row);
}

async function extractPages(pdfPath) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  return stdout.split("\f").map((content, index) => ({
    pageNumber: index + 1,
    content: content.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim(),
  })).filter((page) => page.content.length > 0);
}

async function collectDocuments(events) {
  const documents = [];

  for (const kindDirectory of ["agendas", "minutes"]) {
    const kind = kindDirectory === "agendas" ? "agenda" : "minutes";
    const years = await readdir(join(dataRoot, kindDirectory), { withFileTypes: true });

    for (const yearEntry of years.filter((entry) => entry.isDirectory())) {
      const year = Number(yearEntry.name);
      const directory = join(dataRoot, kindDirectory, yearEntry.name);
      const files = (await readdir(directory)).filter((file) => file.endsWith(".pdf"));

      for (const file of files) {
        const absolutePath = join(directory, file);
        const localPath = relative(projectRoot, absolutePath);
        const embeddedLegistarMatch = file.match(/^(\d{4}-\d{2}-\d{2})_(\d+)_([0-9a-f-]{36})_(agenda|minutes)\.pdf$/i);
        const historicalMatch = file.match(/^(\d{4}-\d{2}-\d{2})_(\d+)_(agenda|minutes)\.pdf$/);
        const archiveMatch = file.match(/^bag(\d{2})(\d{2})(\d{2})_(agenda|minutes)\.pdf$/i);

        if (embeddedLegistarMatch) {
          const [, meetingDate, eventId, eventGuid] = embeddedLegistarMatch;
          const endpointType = kind === "agenda" ? "A" : "M";
          documents.push({
            absolutePath,
            localPath,
            year,
            kind,
            meetingDate,
            title: documentTitle(kind, meetingDate),
            officialUrl: `${legistarOrigin}/View.ashx?M=${endpointType}&ID=${eventId}&GUID=${eventGuid.toUpperCase()}`,
            eventId: Number(eventId),
            eventGuid: eventGuid.toUpperCase(),
          });
        } else if (historicalMatch) {
          const [, meetingDate, eventId] = historicalMatch;
          const event = events.get(eventId);
          if (!event) {
            console.warn(`No Legistar event metadata for ${file}; skipping.`);
            continue;
          }
          const endpointType = kind === "agenda" ? "A" : "M";
          documents.push({
            absolutePath,
            localPath,
            year,
            kind,
            meetingDate,
            title: documentTitle(kind, meetingDate),
            officialUrl: `${legistarOrigin}/View.ashx?M=${endpointType}&ID=${eventId}&GUID=${event.guid}`,
            eventId: Number(eventId),
            eventGuid: event.guid,
          });
        } else if (archiveMatch) {
          const [, month, day, shortYear] = archiveMatch;
          const meetingDate = `20${shortYear}-${month}-${day}`;
          documents.push({
            absolutePath,
            localPath,
            year,
            kind,
            meetingDate,
            title: documentTitle(kind, meetingDate),
            officialUrl: `${archiveOrigin}/sites/default/files/${basename(file)}`,
            eventId: null,
            eventGuid: null,
          });
        }
      }
    }
  }

  return documents.sort((a, b) => a.meetingDate.localeCompare(b.meetingDate) || a.kind.localeCompare(b.kind));
}

async function fetchEventMap() {
  const events = new Map();
  for (const [year, feedId, feedGuid] of feedConfigurations()) {
    const response = await fetch(`${legistarOrigin}/Feed.ashx?M=Calendar&ID=${feedId}&GUID=${feedGuid}&Mode=${year}`);
    if (!response.ok) throw new Error(`Unable to load ${year} Legistar feed: ${response.status}`);
    const xml = await response.text();
    const itemPattern = /<item>.*?<title>Board of Supervisors - (\d{1,2})\/(\d{1,2})\/(\d{4}) - .*?<\/title>.*?<link>[^<]*?(?:[?&]|&amp;)ID=(\d+)&amp;GUID=([^&<]+).*?<\/item>/gs;
    for (const match of xml.matchAll(itemPattern)) {
      const [, month, day, eventYear, eventId, guid] = match;
      events.set(eventId, {
        guid,
        meetingDate: `${eventYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      });
    }
  }
  return events;
}

function documentTitle(kind, meetingDate) {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${meetingDate}T00:00:00Z`));
  const label = kind === "agenda" ? "Agenda" : "Minutes";
  return `Board of Supervisors ${label}: ${date}`;
}

function parseArguments(args) {
  const map = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) map.set(key, true);
    else {
      map.set(key, next);
      index += 1;
    }
  }
  return map;
}

function feedConfigurations() {
  return [
  ["2012", "43067606", "67ef31e5-ed46-4e48-8fbe-6587a4dc6af2"],
  ["2013", "43067628", "bf15dc11-2bea-4d7d-85c5-3fb7c582108f"],
  ["2014", "43067643", "bec6103a-8d35-4ae6-9204-061abff45455"],
  ["2015", "43067660", "2711a9f8-c35c-4d88-ab17-507bd82dc9c6"],
  ["2016", "43067692", "40eeb97f-f213-462f-8376-caf3dd4502da"],
  ["2017", "43067712", "6414f8fd-2eaa-484e-807f-39880b6fba05"],
  ["2018", "43067731", "d92eb129-1f04-49b8-92de-13b6141f86c7"],
  ["2019", "43067743", "a621c99b-4de0-43dc-8734-57f4284a0bf1"],
  ["2020", "43067767", "172aa752-68c4-4d99-8ef3-cc0302d86321"],
  ["2021", "43067801", "62a8624a-e05e-4d27-8701-b2cfce16cc23"],
  ["2022", "43067831", "12caf9d0-228b-4883-98ec-ca93d2d9ed8a"],
  ["2023", "43067850", "d0019ced-be23-40bc-ac18-9229370c5efe"],
  ["2024", "43067870", "89d2024e-c297-4d36-b1b0-ad958d220a63"],
  ["2025", "43067890", "13a9cb1f-8bab-4352-acbf-e4d936f3fc0a"],
  ];
}
