import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const run = promisify(execFile);
const sql = neon(process.env.DATABASE_URL);
const concurrency = numericArgument("concurrency", 6);
const limit = numericArgument("limit", Number.POSITIVE_INFINITY);
const fromYear = numericArgument("from-year", 1900);
const toYear = numericArgument("to-year", 2011);
const force = process.argv.includes("--force");
const workingDirectory = await mkdtemp(join(tmpdir(), "sfbos-legacy-text-"));
const parserName = "legacy-source-text";
const parserVersion = "1.1.0";

const catalog = await sql.query(
  `SELECT id::text, meeting_date::text, year, kind, title, official_url, source_format, page_count
   FROM documents
   WHERE year BETWEEN $1 AND $2
     AND ($3::boolean OR page_count = 0)
   ORDER BY meeting_date, kind, id
   LIMIT $4`,
  [fromYear, toYear, force, Number.isFinite(limit) ? limit : 100000],
);

console.log(`Extracting ${catalog.length} legacy source documents from ${fromYear} through ${toYear}.`);
await Promise.all([
  sql.query(
    `UPDATE ingestion_runs
     SET status = 'failed', finished_at = now(), error = 'Interrupted before completion'
     WHERE source = 'official-legacy-full-board-sources' AND status = 'running'`,
    [],
  ),
  sql.query(
    `UPDATE parser_runs
     SET status = 'failed', finished_at = now(), error = 'Interrupted before completion'
     WHERE parser_name = $1 AND status = 'running'`,
    [parserName],
  ),
]);
const [ingestionRun] = await sql.query(
  `INSERT INTO ingestion_runs (source, status, parser_name, parser_version)
   VALUES ('official-legacy-full-board-sources', 'running', $1, $2)
   RETURNING id::text`,
  [parserName, parserVersion],
);
const [parserRun] = await sql.query(
  `INSERT INTO parser_runs (parser_name, parser_version, config_hash, status)
   VALUES ($1, $2, $3, 'running') RETURNING id::text`,
  [parserName, parserVersion, sha256("html-content-container|pdftotext-layout|tesseract-180dpi")],
);

let indexedDocuments = 0;
let indexedPages = 0;
let indexedHtml = 0;
let indexedPdf = 0;
let ocrDocuments = 0;
let skipped = 0;
const failures = [];

try {
  for (let offset = 0; offset < catalog.length; offset += concurrency) {
    const batch = catalog.slice(offset, offset + concurrency);
    const extracted = await Promise.all(batch.map((record) => extractRecord(record, workingDirectory)));
    const outcomes = await Promise.all(extracted.map((result) => persistResult(result, parserRun.id)));
    for (const outcome of outcomes) {
      if (outcome.status === "failed") {
        failures.push(outcome.failure);
        console.warn(`FAILED ${outcome.failure.documentId}: ${outcome.failure.error}`);
      } else if (outcome.status === "skipped") {
        skipped += 1;
      } else {
        indexedDocuments += 1;
        indexedPages += outcome.pages;
        if (outcome.sourceFormat === "html") indexedHtml += 1;
        else indexedPdf += 1;
        if (outcome.method.includes("ocr")) ocrDocuments += 1;
      }
    }
    const completed = Math.min(offset + batch.length, catalog.length);
    if (completed === catalog.length || completed % 24 === 0) {
      console.log(`${completed}/${catalog.length}: indexed ${indexedDocuments} documents and ${indexedPages} pages; ${failures.length} failures.`);
    }
  }

  const statistics = {
    catalogDocuments: catalog.length,
    indexedDocuments,
    indexedPages,
    indexedHtml,
    indexedPdf,
    ocrDocuments,
    skipped,
    failedDocuments: failures.length,
    failures,
    fromYear,
    toYear,
  };
  await sql.query(
    `UPDATE parser_runs SET status = 'complete', finished_at = now(), statistics = $2::jsonb WHERE id = $1`,
    [parserRun.id, JSON.stringify(statistics)],
  );
  await sql.query(
    `UPDATE ingestion_runs SET status = 'complete', finished_at = now(), statistics = $2::jsonb WHERE id = $1`,
    [ingestionRun.id, JSON.stringify(statistics)],
  );
  console.log(JSON.stringify(statistics, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await Promise.all([
    sql.query("UPDATE parser_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1", [parserRun.id, message]),
    sql.query("UPDATE ingestion_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1", [ingestionRun.id, message]),
  ]);
  throw error;
} finally {
  await rm(workingDirectory, { recursive: true, force: true });
}

async function extractRecord(record, temporaryDirectory) {
  try {
    const response = await fetchWithRetry(record.official_url);
    if (record.source_format === "html") {
      const content = extractLegacyHtml(await response.text());
      if (content.length < 80) throw new Error("official HTML did not contain extractable meeting text");
      return { record, pages: [content], method: "html", error: null };
    }

    const pdfPath = join(temporaryDirectory, `${record.id}.pdf`);
    await writeFile(pdfPath, Buffer.from(await response.arrayBuffer()));
    const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const textPages = splitPdfPages(stdout);
    if (textPages.length && textPages.every((page) => page.length >= 20)) {
      return { record, pages: textPages, method: "pdftotext", error: null };
    }

    const ocrPages = await ocrPdf(pdfPath, temporaryDirectory, record.id);
    const pageCount = Math.max(textPages.length, ocrPages.length);
    const pages = Array.from({ length: pageCount }, (_, index) =>
      textPages[index]?.length >= 20 ? textPages[index] : (ocrPages[index] ?? ""),
    );
    if (!pages.some((page) => page.length >= 20)) {
      throw new Error("official PDF did not contain machine-readable or OCR-readable text");
    }
    return {
      record,
      pages,
      method: textPages.some((page) => page.length >= 20) ? "pdftotext+ocr" : "ocr",
      error: null,
    };
  } catch (error) {
    return { record, pages: [], method: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function ocrPdf(pdfPath, temporaryDirectory, documentId) {
  const prefix = join(temporaryDirectory, `ocr-${documentId}`);
  await run("pdftoppm", ["-r", "180", "-gray", "-png", pdfPath, prefix], { maxBuffer: 64 * 1024 * 1024 });
  const images = (await readdir(temporaryDirectory))
    .filter((name) => name.startsWith(`ocr-${documentId}-`) && name.endsWith(".png"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const pages = [];
  for (const image of images) {
    const { stdout } = await run("tesseract", [join(temporaryDirectory, image), "stdout", "-l", "eng", "--psm", "6"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const content = normalizeExtractedText(stdout);
    pages.push(content);
  }
  return pages;
}

async function persistResult(result, parserRunId) {
  if (result.error) {
    return {
      status: "failed",
      failure: { documentId: result.record.id, officialUrl: result.record.official_url, error: result.error },
    };
  }

  try {
    const contentSha256 = contentHash(result.pages);
    const [existingVersion] = await sql.query(
      "SELECT id FROM document_versions WHERE document_id = $1 AND content_sha256 = $2 LIMIT 1",
      [result.record.id, contentSha256],
    );
    if (existingVersion && !force) return { status: "skipped" };

    await Promise.all([
      sql.query("DELETE FROM pages WHERE document_id = $1", [result.record.id]),
      sql.query("DELETE FROM legislative_items WHERE document_id = $1", [result.record.id]),
      sql.query("DELETE FROM public_comments WHERE document_id = $1", [result.record.id]),
    ]);
    for (let pageOffset = 0; pageOffset < result.pages.length; pageOffset += 25) {
      const pages = result.pages.slice(pageOffset, pageOffset + 25);
      const values = [];
      const placeholders = pages.map((content, pageIndex) => {
        const base = pageIndex * 3;
        values.push(result.record.id, pageOffset + pageIndex + 1, content);
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      });
      await sql.query(
        `INSERT INTO pages (document_id, page_number, content) VALUES ${placeholders.join(", ")}`,
        values,
      );
    }
    await sql.query(
      `UPDATE documents SET page_count = $2, indexed_at = now() WHERE id = $1`,
      [result.record.id, result.pages.length],
    );
    if (!existingVersion) {
      const [version] = await sql.query(
        `INSERT INTO document_versions (
           document_id, version_number, content_sha256, page_count, parser_run_id
         )
         SELECT $1, coalesce(max(version_number), 0) + 1, $2, $3, $4
         FROM document_versions WHERE document_id = $1
         RETURNING version_number`,
        [result.record.id, contentSha256, result.pages.length, parserRunId],
      );
      await sql.query(
        `INSERT INTO change_log (entity_type, entity_key, change_type, version, payload)
         VALUES ('document', $1, $2, $3, $4::jsonb)`,
        [
          result.record.id,
          Number(version.version_number) === 1 ? "create" : "update",
          String(version.version_number),
          JSON.stringify({
            contentSha256,
            pageCount: result.pages.length,
            sourceFormat: result.record.source_format,
            extractionMethod: result.method,
          }),
        ],
      );
    }
    return {
      status: "indexed",
      pages: result.pages.length,
      sourceFormat: result.record.source_format,
      method: result.method,
    };
  } catch (error) {
    return {
      status: "failed",
      failure: {
        documentId: result.record.id,
        officialUrl: result.record.official_url,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function splitPdfPages(value) {
  const pages = value.split("\f");
  if (pages.at(-1)?.trim() === "") pages.pop();
  return pages.map(normalizeExtractedText);
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(45000),
        headers: { "User-Agent": "sfbos.info public-record indexer (https://sfbos.info)" },
      });
      if (!response.ok) throw new Error(`official source returned HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 400));
    }
  }
  throw lastError;
}

function extractLegacyHtml(html) {
  const opening = /<div\b[^>]*\bid=["']ctl00_content_Screen["'][^>]*>/i.exec(html);
  if (!opening) throw new Error("legacy content container was not found");
  const contentStart = opening.index + opening[0].length;
  const divPattern = /<\/?div\b[^>]*>/gi;
  divPattern.lastIndex = contentStart;
  let depth = 1;
  let contentEnd = html.length;
  for (let match = divPattern.exec(html); match; match = divPattern.exec(html)) {
    depth += /^<\/div/i.test(match[0]) ? -1 : 1;
    if (depth === 0) {
      contentEnd = match.index;
      break;
    }
  }
  const primary = htmlToText(html.slice(contentStart, contentEnd));
  if (primary.length >= 80) return primary;

  // A small number of legacy pages close the content div before the agenda body.
  // Their archived CMS marker is a more reliable boundary than malformed HTML.
  const archiveMarker = html.indexOf("<!--&#86;&#73;&#83;&#73;&#79;&#78;&#67;&#77;&#84;", contentStart);
  return htmlToText(html.slice(contentStart, archiveMarker >= 0 ? archiveMarker : html.length));
}

function htmlToText(html) {
  const content = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|tr|h[1-6]|table)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<t[dh]\b[^>]*>/gi, "\t")
    .replace(/<[^>]+>/g, " ");
  return normalizeExtractedText(decodeEntities(content));
}

function decodeEntities(value) {
  const named = {
    amp: "&", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-",
    lt: "<", gt: ">", copy: "©", reg: "®", bull: "•",
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function normalizeExtractedText(value) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentHash(pages) {
  return sha256(pages.map((content, index) => `${index + 1}\n${content}`).join("\f"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function numericArgument(name, fallback) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(inlinePrefix));
  const index = process.argv.indexOf(`--${name}`);
  const raw = inline ? inline.slice(inlinePrefix.length) : index >= 0 ? process.argv[index + 1] : undefined;
  if (raw === undefined) return fallback;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 1) throw new Error(`${name} must be a positive number`);
  return number;
}
